// Le chef d'orchestre : il fait parler les IA chacune à son tour et transmet leurs messages.
const crypto = require('node:crypto');
const { StoppedError } = require('./errors');
const { startTurn } = require('./agents/runner');
const { scanImages, collectNewImages } = require('./images');
const { USER, AGENT_IDS, isAgent } = require('./participants');
const { rules, buildPrompt, parseReply } = require('./protocol');
const { toMeta } = require('./store');

/** Inscrit une IA dans la file d'un salon, sans doublon. `first` la fait passer avant les autres. */
function enqueue(room, agentId, first = false) {
  room.queue = room.queue.filter((id) => id !== agentId);
  if (first) room.queue.unshift(agentId);
  else room.queue.push(agentId);
}

class Conductor {
  #store;
  #hub;
  #agents;
  #turns = new Map(); // salon -> tour en cours

  constructor({ store, hub, agents }) {
    this.#store = store;
    this.#hub = hub;
    this.#agents = agents;
  }

  /** La personne écrit dans le salon : à une IA, ou aux deux. */
  post(room, { to, text }) {
    const recipients = isAgent(to) ? [to] : AGENT_IDS;
    this.#addMessage(room, { from: USER, to: isAgent(to) ? to : 'both', text });
    for (const agentId of recipients) enqueue(room, agentId);
    this.#announce(room);
    this.#pump(room);
  }

  /** En pause, le tour en cours se termine mais le suivant attend. */
  setPaused(room, paused) {
    room.paused = !!paused;
    this.#announce(room);
    this.#pump(room);
  }

  /** Arrête l'IA en cours et vide la file. */
  stop(room) {
    room.queue = [];
    room.paused = false;
    const turn = this.#turns.get(room.id);
    if (turn) {
      // L'outil met quelques secondes à se fermer proprement : on le signale à la page.
      room.stopping = true;
      turn.stop();
    }
    this.#announce(room);
  }

  /** Interrompt un salon qu'on supprime, sans rien y écrire. */
  abandon(room) {
    this.#turns.get(room.id)?.stop();
  }

  stopAll() {
    for (const turn of this.#turns.values()) turn.stop();
  }

  #announce(room) {
    this.#hub.broadcast('room', toMeta(room));
  }

  #addMessage(room, fields) {
    const message = { id: crypto.randomUUID(), ts: Date.now(), ...fields };
    room.messages.push(message);
    this.#store.save(room);
    this.#hub.broadcast('message', { roomId: room.id, message });
    return message;
  }

  /** Donne la main à la prochaine IA de la file, puis recommence tant qu'il reste quelqu'un. */
  async #pump(room) {
    if (room.running || room.paused) return;
    const agentId = room.queue.shift();
    if (!agentId) return this.#announce(room);

    const agent = this.#agents.get(agentId);
    const session = room.sessions[agentId];
    // On note où en est la conversation : ce qui arrive pendant le tour sera transmis au suivant.
    const readUpTo = room.messages.length;
    const prompt = buildPrompt(room, agentId, { includeRules: agent.rulesInFirstPrompt && !session });
    if (!prompt) return this.#pump(room);

    room.running = agentId;
    this.#announce(room);
    try {
      this.#addMessage(room, await this.#runTurn(room, agent, session, prompt, readUpTo));
    } catch (error) {
      room.queue = [];
      if (!this.#store.has(room.id)) return;
      if (error instanceof StoppedError) this.#addMessage(room, { from: 'system', kind: 'info', code: 'stopped', agent: agentId });
      else this.#addMessage(room, { from: 'system', kind: 'error', code: 'failed', agent: agentId, detail: error.message });
    } finally {
      this.#turns.delete(room.id);
    }
    room.running = null;
    room.stopping = false;
    this.#store.save(room);
    this.#announce(room);
    this.#pump(room);
  }

  /** Fait travailler une IA et renvoie son message, avec ses actions et les images créées. */
  async #runTurn(room, agent, session, prompt, readUpTo) {
    const actions = [];
    const imagesBefore = scanImages(room.cwd);
    const startedAt = Date.now();
    const turn = startTurn(agent, { cwd: room.cwd, access: room.access, session, rules: rules(room, agent.id), prompt }, (action) => {
      // Une IA répète souvent la même action plusieurs fois de suite : on ne la note qu'une fois.
      const last = actions[actions.length - 1];
      if (!last || last.verb !== action.verb || last.target !== action.target) actions.push(action);
      this.#hub.broadcast('activity', { roomId: room.id, agent: agent.id, action });
    });
    this.#turns.set(room.id, turn);

    const result = await turn.done;
    room.sessions[agent.id] = result.session;
    room.seen[agent.id] = readUpTo;
    const reply = parseReply(agent.id, result.text);
    const id = crypto.randomUUID();
    const images = collectNewImages({
      cwd: room.cwd,
      before: imagesBefore,
      startedAt,
      fallbackDir: agent.generatedImagesDir(result.session),
      destinationDir: this.#store.mediaDirOf(room.id),
      urlPrefix: `/api/media/${room.id}`,
      filePrefix: id.slice(0, 8),
    });
    // Un message adressé à l'autre IA lui donne la main tout de suite.
    if (isAgent(reply.to)) enqueue(room, reply.to, true);
    return { id, from: agent.id, to: reply.to, text: reply.text, actions, images };
  }
}

module.exports = { Conductor };
