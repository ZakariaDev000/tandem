// Les salons : en mémoire pendant que l'appli tourne, et un fichier JSON par salon sur le disque.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AppError } = require('./errors');
const { AGENT_IDS } = require('./participants');
const { shorten, expandHome } = require('./util');

// Ce qui décrit le tour en cours ne s'enregistre pas : au redémarrage, plus rien ne tourne.
const RUNTIME_FIELDS = ['running', 'queue', 'paused', 'stopping', 'approvals'];

const blankPerAgent = (value) => Object.fromEntries(AGENT_IDS.map((id) => [id, value]));

function resetRuntime(room) {
  room.running = []; // les IA en train de répondre
  room.queue = [];
  room.paused = false;
  room.stopping = false;
  room.approvals = []; // les demandes d'autorisation qui attendent la personne
}

/** Ce que la page reçoit d'un salon. */
function toPublic(room) {
  const { sessions, seen, ...visible } = room;
  return visible;
}

/** Un salon sans ses messages, pour signaler un changement d'état sans tout renvoyer. */
function toMeta(room) {
  const { messages, ...meta } = toPublic(room);
  return meta;
}

class RoomStore {
  #rooms = new Map();
  #roomsDir;
  #workspacesDir;
  #mediaDir;

  constructor({ ROOMS_DIR, WORKSPACES_DIR, MEDIA_DIR }) {
    this.#roomsDir = ROOMS_DIR;
    this.#workspacesDir = WORKSPACES_DIR;
    this.#mediaDir = MEDIA_DIR;
    for (const dir of [ROOMS_DIR, WORKSPACES_DIR, MEDIA_DIR]) fs.mkdirSync(dir, { recursive: true });
  }

  load() {
    for (const file of fs.readdirSync(this.#roomsDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const room = JSON.parse(fs.readFileSync(path.join(this.#roomsDir, file), 'utf8'));
        resetRuntime(room);
        // Un salon enregistré avant les demandes d'autorisation n'a encore rien d'autorisé pour toujours.
        room.allowed ||= [];
        this.#rooms.set(room.id, room);
        if (this.#migrate(room)) this.save(room);
      } catch (error) {
        console.error('Unreadable room file:', file, error.message);
      }
    }
  }

  get(id) {
    return this.#rooms.get(id);
  }

  has(id) {
    return this.#rooms.has(id);
  }

  all() {
    return [...this.#rooms.values()];
  }

  /** Crée un salon. Sans dossier donné, il reçoit un dossier vide rien qu'à lui. */
  create({ title, cwd, access }) {
    const id = crypto.randomUUID().slice(0, 8);
    let folder = expandHome(cwd);
    const ownFolder = !folder;
    if (ownFolder) {
      folder = this.#ownFolderOf(id);
      fs.mkdirSync(folder, { recursive: true });
    } else if (!path.isAbsolute(folder)) {
      throw new AppError(400, 'folder_relative', 'Give the full path of the folder.');
    } else if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      throw new AppError(400, 'folder_missing', 'This folder does not exist.');
    }
    const room = {
      id,
      title: shorten(title, 60) || 'Untitled room',
      cwd: folder,
      ownFolder,
      access: access === 'read' ? 'read' : 'write',
      createdAt: Date.now(),
      allowed: [], // ce que la personne a autorisé pour toujours dans ce salon
      messages: [],
      sessions: blankPerAgent(null),
      seen: blankPerAgent(0),
    };
    resetRuntime(room);
    this.#rooms.set(id, room);
    this.save(room);
    return room;
  }

  save(room) {
    // Un salon supprimé pendant qu'une IA travaillait ne doit pas réapparaître.
    if (!this.#rooms.has(room.id)) return;
    const persisted = Object.fromEntries(Object.entries(room).filter(([key]) => !RUNTIME_FIELDS.includes(key)));
    const file = this.#fileOf(room.id);
    // Écriture en deux temps : une coupure en plein enregistrement ne laisse pas un fichier tronqué.
    fs.writeFileSync(file + '.tmp', JSON.stringify(persisted, null, 1));
    fs.renameSync(file + '.tmp', file);
  }

  delete(room) {
    this.#rooms.delete(room.id);
    fs.rmSync(this.#fileOf(room.id), { force: true });
    fs.rmSync(this.mediaDirOf(room.id), { recursive: true, force: true });
    // Le dossier créé pour un salon sans projet n'est retiré que s'il est vide.
    if (room.ownFolder) {
      try {
        fs.rmdirSync(room.cwd);
      } catch {}
    }
  }

  mediaDirOf(roomId) {
    return path.join(this.#mediaDir, roomId);
  }

  #fileOf(roomId) {
    return path.join(this.#roomsDir, roomId + '.json');
  }

  #ownFolderOf(roomId) {
    return path.join(this.#workspacesDir, roomId);
  }

  /** Met un salon enregistré par une ancienne version au format actuel. Renvoie true s'il a changé. */
  #migrate(room) {
    let changed = false;
    // Un salon sans projet range ses fichiers dans le dossier de données de l'appli. Si l'appli a
    // été déplacée, on la suit : les sessions des IA étaient liées à l'ancien dossier, donc chaque
    // IA repart sur une session neuve et reçoit toute la conversation à son prochain tour.
    if (room.ownFolder && room.cwd !== this.#ownFolderOf(room.id)) {
      room.cwd = this.#ownFolderOf(room.id);
      room.sessions = blankPerAgent(null);
      room.seen = blankPerAgent(0);
      fs.mkdirSync(room.cwd, { recursive: true });
      changed = true;
    }
    return changed;
  }
}

module.exports = { RoomStore, toPublic, toMeta };
