// Les demandes d'autorisation : une IA veut faire ce que son outil ne lui permet pas seule, et
// attend que la personne réponde dans la page. Le salon porte les demandes en attente (`approvals`)
// et ce que la personne a autorisé une fois pour toutes (`allowed`).
const crypto = require('node:crypto');
const { AppError } = require('./errors');
const { toMeta } = require('./store');

// Le chemin où une IA dépose ses demandes ; le jeton de son guichet le termine.
const PROMPT_PATH = '/api/permission-prompt';

const DECISIONS = ['allow', 'always', 'refuse'];
const ALLOWED = { allow: true };
const REFUSED = { allow: false, reason: 'refused' };
const STOPPED = { allow: false, reason: 'stopped' };

class Approvals {
  #store;
  #hub;
  #origin;
  #gates = new Map(); // jeton -> guichet ouvert pour le tour d'une IA
  #waiting = new Map(); // demande en attente -> de quoi rendre la décision à l'IA

  constructor({ store, hub, origin }) {
    this.#store = store;
    this.#hub = hub;
    this.#origin = origin;
  }

  /**
   * Ouvre un guichet pour le tour d'une IA qui sait demander la permission. Son adresse contient
   * un jeton connu de ce seul tour : il prouve d'où vient une demande. À fermer à la fin du tour.
   */
  open(room, agent) {
    const token = crypto.randomBytes(16).toString('hex');
    const tool = agent.permissionPrompt.tool((request, signal) => this.#ask(token, request, signal));
    this.#gates.set(token, { room, agentId: agent.id, tool });
    return { url: `${this.#origin}${PROMPT_PATH}/${token}`, close: () => this.close(room, agent.id) };
  }

  /** L'outil d'un guichet, ou rien s'il est fermé. */
  toolOf(token) {
    return this.#gates.get(token)?.tool;
  }

  /**
   * Ferme les guichets d'un salon, ou d'une seule de ses IA : personne ne répondra plus aux
   * demandes en attente, et une IA qui tarde à s'arrêter ne peut plus en déposer.
   */
  close(room, agentId) {
    const concerns = (owner) => !agentId || owner === agentId;
    for (const [token, gate] of this.#gates) if (gate.room === room && concerns(gate.agentId)) this.#gates.delete(token);
    const dropped = room.approvals.filter((request) => concerns(request.agent));
    for (const request of dropped) this.#settle(room, request, STOPPED);
    if (dropped.length) this.#announce(room);
  }

  /**
   * La personne répond à une demande : une fois, pour toujours dans ce salon, ou non.
   * Renvoie la demande réglée. Une réponse à une demande inconnue ou déjà réglée est rejetée.
   */
  answer(room, requestId, decision) {
    if (!DECISIONS.includes(decision)) throw new AppError(400, 'approval_invalid', 'Unknown decision.');
    const request = room.approvals.find((pending) => pending.id === requestId);
    if (!request) throw new AppError(409, 'approval_gone', 'This request is no longer waiting for an answer.');
    if (decision === 'always') {
      const { agent, tool, summary } = request;
      room.allowed.push({ id: crypto.randomUUID(), agent, tool, summary });
      this.#store.save(room);
    }
    this.#settle(room, request, decision === 'refuse' ? REFUSED : ALLOWED);
    this.#announce(room);
    return request;
  }

  /** Oublie une autorisation permanente. Sans effet si elle n'existe plus. */
  revoke(room, ruleId) {
    room.allowed = room.allowed.filter((rule) => rule.id !== ruleId);
    this.#store.save(room);
    this.#announce(room);
  }

  /** Soumet une demande à la personne. La décision vient quand elle répond : rien ne presse. */
  #ask(token, { tool, action, summary, input }, signal) {
    const gate = this.#gates.get(token);
    if (!gate) return Promise.resolve(STOPPED);
    const { room, agentId } = gate;
    // Une autorisation permanente vaut pour la même action exactement, pas pour une action voisine.
    const standing = room.allowed.some((rule) => rule.agent === agentId && rule.tool === tool && rule.summary === summary);
    if (standing) return Promise.resolve(ALLOWED);

    const request = { id: crypto.randomUUID(), ts: Date.now(), agent: agentId, tool, action, summary, input };
    return new Promise((resolve) => {
      this.#waiting.set(request.id, resolve);
      room.approvals.push(request);
      this.#announce(room);
      // Une IA qui n'écoute plus ne doit pas laisser sa question affichée.
      signal.addEventListener('abort', () => {
        if (this.#settle(room, request, STOPPED)) this.#announce(room);
      });
    });
  }

  /** Rend la décision à l'IA et retire la demande. Renvoie false si elle était déjà réglée. */
  #settle(room, request, decision) {
    const resolve = this.#waiting.get(request.id);
    if (!resolve) return false;
    this.#waiting.delete(request.id);
    room.approvals = room.approvals.filter((pending) => pending.id !== request.id);
    resolve(decision);
    return true;
  }

  #announce(room) {
    if (this.#store.has(room.id)) this.#hub.broadcast('room', toMeta(room));
  }
}

module.exports = { Approvals, PROMPT_PATH };
