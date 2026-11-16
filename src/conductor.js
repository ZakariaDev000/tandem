// Le chef d'orchestre : il donne la main aux IA et transmet leurs messages.
// La file d'un salon est une suite d'étapes. Une étape réunit une IA, ou plusieurs
// qui répondent en même temps sans se lire.
const crypto = require('node:crypto');
const { StoppedError } = require('./errors');
const { startTurn } = require('./agents/runner');
const { scanImages, collectNewImages } = require('./images');
const { USER, AGENT_IDS, isAgent } = require('./participants');
const { rules, buildPrompt, parseReply } = require('./protocol');
const { toMeta } = require('./store');

/** Inscrit une étape dans la file d'un salon. Une IA déjà en attente ailleurs n'y figure qu'une fois. */
function enqueue(room, agentIds, first = false) {
  room.queue = room.queue.map((step) => step.filter((id) => !agentIds.includes(id))).filter((step) => step.length);
  if (first) room.queue.unshift(agentIds);
  else room.queue.push(agentIds);
}

class Conductor {
  #store;
  #hub;
  #agents;
  #changes;
  #turns = new Map(); // salon -> tours en cours, par IA

  constructor({ store, hub, agents, changes }) {
    this.#store = store;
    this.#hub = hub;
    this.#agents = agents;
    this.#changes = changes;
  }

  /**
   * La personne écrit dans le salon : à une IA, ou aux deux.
   * Aux deux, elles répondent l'une après l'autre (la seconde lit la première),
   * ou en même temps si `parallel` est demandé.
   */
  post(room, { to, text, parallel }) {
    const recipients = isAgent(to) ? [to] : AGENT_IDS;
    const together = !!parallel && recipients.length > 1;
    this.#addMessage(room, { from: USER, to: isAgent(to) ? to : 'both', text, ...(together && { parallel: true }) });
    if (together) enqueue(room, recipients);
    else for (const agentId of recipients) enqueue(room, [agentId]);
    this.#announce(room);
    this.#pump(room);
  }

  /** En pause, l'étape en cours se termine mais la suivante attend. */
  setPaused(room, paused) {
    room.paused = !!paused;
    this.#announce(room);
    this.#pump(room);
  }

  /** Arrête les IA en cours et vide la file. */
  stop(room) {
    room.queue = [];
    room.paused = false;
    const turns = this.#turnsOf(room);
    if (turns.size) {
      // Un outil met quelques secondes à se fermer proprement : on le signale à la page.
      room.stopping = true;
      for (const turn of turns.values()) turn.stop();
    }
    this.#announce(room);
  }

  /** Interrompt un salon qu'on supprime, sans rien y écrire. */
  abandon(room) {
    for (const turn of this.#turnsOf(room).values()) turn.stop();
  }

  /** Vrai tant qu'une IA répond ou attend son tour, dans n'importe quel salon. */
  isBusy() {
    return this.#store.all().some((room) => room.running.length > 0 || room.queue.length > 0);
  }

  stopAll() {
    for (const turns of this.#turns.values()) for (const turn of turns.values()) turn.stop();
  }

  #turnsOf(room) {
    if (!this.#turns.has(room.id)) this.#turns.set(room.id, new Map());
    return this.#turns.get(room.id);
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

  /** Lance la prochaine étape de la file, puis recommence tant qu'il en reste. */
  async #pump(room) {
    if (room.running.length || room.paused) return;
    const step = room.queue.shift();
    if (!step) return this.#announce(room);

    // Tout ce qui s'est dit jusqu'ici est remis aux IA de l'étape. Ce qui arrive pendant
    // l'étape, y compris la réponse de l'autre IA, leur sera transmis à leur prochain tour.
    const readUpTo = room.messages.length;
    const jobs = step
      .map((agentId) => {
        const agent = this.#agents.get(agentId);
        const session = room.sessions[agentId];
        const prompt = buildPrompt(room, agentId, {
          includeRules: agent.rulesInFirstPrompt && !session,
          alongside: step.filter((id) => id !== agentId),
        });
        return { agent, session, prompt };
      })
      .filter((job) => job.prompt);
    if (!jobs.length) return this.#pump(room);

    room.running = jobs.map((job) => job.agent.id);
    this.#announce(room);
    // Les IA d'une même étape partagent ce relevé : une image n'est attribuée qu'à la première qui finit.
    const shared = { images: scanImages(room.cwd), startedAt: Date.now(), changes: this.#changes.startStep(room) };
    const outcomes = await Promise.all(jobs.map((job) => this.#runJob(room, job, readUpTo, shared)));
    this.#turns.delete(room.id);
    if (!this.#store.has(room.id)) return;

    // Une IA en échec ou arrêtée interrompt la suite : mieux vaut rendre la main à la personne.
    // Pareil si l'arrêt a été demandé alors qu'elle venait de finir.
    if (outcomes.includes(null) || room.stopping) room.queue = [];
    // Un message adressé à une autre IA lui donne la main tout de suite.
    else for (const to of outcomes) if (isAgent(to)) enqueue(room, [to], true);

    room.stopping = false;
    this.#store.save(room);
    this.#announce(room);
    this.#pump(room);
  }

  /**
   * Fait travailler une IA, publie son message, puis la retire des IA en cours.
   * Renvoie le destinataire de sa réponse, ou null si elle a échoué ou a été arrêtée.
   */
  async #runJob(room, job, readUpTo, shared) {
    const agentId = job.agent.id;
    let recipient = null;
    try {
      const message = await this.#runTurn(room, job, readUpTo, shared);
      this.#addMessage(room, message);
      recipient = message.to;
    } catch (error) {
      if (this.#store.has(room.id)) {
        if (error instanceof StoppedError) this.#addMessage(room, { from: 'system', kind: 'info', code: 'stopped', agent: agentId });
        else this.#addMessage(room, { from: 'system', kind: 'error', code: 'failed', agent: agentId, detail: error.message });
      }
    }
    this.#turnsOf(room).delete(agentId);
    room.running = room.running.filter((id) => id !== agentId);
    if (this.#store.has(room.id)) this.#announce(room);
    return recipient;
  }

  /** Lance le tour d'une IA et renvoie son message, avec ses actions, les images créées et les fichiers changés. */
  async #runTurn(room, { agent, session, prompt }, readUpTo, shared) {
    // L'IA ne commence qu'une fois le dossier relevé. D'ici là, l'arrêter doit déjà être possible.
    let stopped = false;
    this.#turnsOf(room).set(agent.id, { stop: () => (stopped = true) });
    await shared.changes.ready;
    if (stopped) throw new StoppedError();

    const actions = [];
    const turn = startTurn(agent, { cwd: room.cwd, access: room.access, session, rules: rules(room, agent.id), prompt }, (action) => {
      // Une IA répète souvent la même action plusieurs fois de suite : on ne la note qu'une fois.
      const last = actions[actions.length - 1];
      if (!last || last.verb !== action.verb || last.target !== action.target) actions.push(action);
      this.#hub.broadcast('activity', { roomId: room.id, agent: agent.id, action });
    });
    this.#turnsOf(room).set(agent.id, turn);

    const result = await turn.done;
    room.sessions[agent.id] = result.session;
    room.seen[agent.id] = readUpTo;
    const reply = parseReply(agent.id, result.text);
    const id = crypto.randomUUID();
    const images = collectNewImages({
      cwd: room.cwd,
      before: shared.images,
      startedAt: shared.startedAt,
      fallbackDir: agent.generatedImagesDir(result.session),
      destinationDir: this.#store.mediaDirOf(room.id),
      urlPrefix: `/api/media/${room.id}`,
      filePrefix: id.slice(0, 8),
    });
    shared.images = scanImages(room.cwd);
    const changes = await shared.changes.collect();
    return { id, from: agent.id, to: reply.to, text: reply.text, actions, images, ...(changes && { changes }) };
  }
}

module.exports = { Conductor };
