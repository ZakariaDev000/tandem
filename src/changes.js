// Ce qu'une IA a changé dans le dossier de travail pendant son tour : le résumé joint à son
// message, puis le détail d'un fichier quand la page le demande.
const { AppError } = require('./errors');

const MAX_LISTED_FILES = 50;
const MAX_PATCH_BYTES = 200e3;
const TREE_ID = /^[0-9a-f]{40,64}$/;

class TurnChanges {
  #snapshots;

  constructor({ snapshots }) {
    this.#snapshots = snapshots;
  }

  /**
   * Relève le dossier au début d'une étape. `ready` est tenue quand ce relevé est pris ;
   * `collect()` renvoie ensuite ce qui a changé depuis le relevé précédent, ou rien.
   */
  startStep(room) {
    let latest = this.#snapshots.take(room.id, room.cwd);
    return {
      ready: latest,
      // Les IA d'une même étape partagent le dossier. Comme pour les images, un changement revient
      // à la première qui finit, et son relevé sert de point de départ à la suivante.
      collect: () => {
        const from = latest;
        latest = this.#snapshots.take(room.id, room.cwd);
        return this.#between(room.id, from, latest);
      },
    };
  }

  /**
   * Le détail d'un fichier changé par un message. La page ne le désigne que par sa place dans
   * la liste jointe au message : aucun chemin ni relevé ne vient d'elle.
   */
  async fileOf(room, messageId, index) {
    const message = room.messages.find((candidate) => candidate.id === messageId);
    if (!message) throw new AppError(404, 'message_not_found', 'Message not found.');
    const { from, to, files } = message.changes || {};
    const file = Array.isArray(files) && /^\d+$/.test(index) ? files[Number(index)] : undefined;
    if (!file || !TREE_ID.test(from) || !TREE_ID.test(to)) throw new AppError(404, 'change_not_found', 'Change not found.');
    if (file.binary) return { kind: 'binary' };
    let patch;
    try {
      patch = await this.#snapshots.patch(room.id, from, to, [file.from, file.path].filter(Boolean), MAX_PATCH_BYTES);
    } catch {
      throw new AppError(500, 'changes_unavailable', 'These changes can no longer be read.');
    }
    return patch === null ? { kind: 'too_large' } : { kind: 'text', patch };
  }

  /** Oublie les relevés d'un salon qu'on supprime. */
  forget(room) {
    return this.#snapshots.remove(room.id);
  }

  /** Résume ce qui sépare deux relevés. Rien si l'un des deux manque ou si rien n'a changé. */
  async #between(roomId, earlier, later) {
    const [from, to] = await Promise.all([earlier, later]);
    if (!from || !to || from === to) return undefined;
    let files;
    try {
      files = await this.#snapshots.compare(roomId, from, to);
    } catch {
      return undefined;
    }
    if (!files.length) return undefined;
    const lines = (key) => files.reduce((sum, file) => sum + (file[key] || 0), 0);
    return {
      from,
      to,
      // Les totaux portent sur tous les fichiers, même ceux que la liste ne montre pas.
      count: files.length,
      added: lines('added'),
      removed: lines('removed'),
      files: files.slice(0, MAX_LISTED_FILES),
      ...(files.length > MAX_LISTED_FILES && { truncated: true }),
    };
  }
}

module.exports = { TurnChanges };
