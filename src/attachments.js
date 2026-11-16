// Les fichiers que la personne joint à ses messages : gardés par salon dans le dossier de
// données, sous un nom choisi ici. Le nom d'origine ne sert que de libellé.
const crypto = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('./errors');

// Assez pour une capture, une maquette ou un document, comme pour les images créées par les IA.
const MAX_FILE_BYTES = 25e6;
const MAX_PER_MESSAGE = 10;
const MAX_NAME_LENGTH = 100;
// Un envoi jamais rattaché à un message est retiré au bout de ce délai.
const PENDING_MS = 24 * 3600 * 1000;
const SWEEP_MS = 3600 * 1000;

const URL_PREFIX = '/api/attachments';
const LIMITS = { maxFileBytes: MAX_FILE_BYTES, maxPerMessage: MAX_PER_MESSAGE };

// Les seuls types que la page affiche. Tout le reste, SVG compris, se télécharge.
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
// La forme des noms créés ici : rien d'autre n'est jamais servi.
const STORED_NAME = /^[0-9a-f]{16}(\.[a-z0-9]{1,10})?$/;
// Caractères de contrôle, invisibles, ou qui inversent le sens de lecture pour maquiller une extension.
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

const tooLarge = () => new AppError(413, 'attachment_too_large', 'The file is too large.');
const notFound = () => new AppError(404, 'attachment_not_found', 'Attachment not found.');

/** Fait d'un nom reçu un libellé sans danger : ni chemin, ni caractère invisible, ni longueur absurde. */
function sanitizeName(raw) {
  const name = String(raw ?? '')
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, '')
    .split(/[\\/]/)
    .pop()
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  // On compte en caractères entiers, pour ne pas couper un emoji en deux.
  const characters = [...name];
  if (characters.length <= MAX_NAME_LENGTH) return name || 'file';
  const extension = storedExtension(name);
  return characters.slice(0, MAX_NAME_LENGTH - extension.length).join('') + extension;
}

/** L'extension donnée au fichier gardé : celle du libellé si elle est banale, sinon aucune. */
function storedExtension(name) {
  const extension = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
}

const isImage = (storedName) => IMAGE_EXTENSIONS.has(path.extname(storedName));

/**
 * Écrit un flux dans un nouveau fichier sans jamais dépasser `maxBytes`. Renvoie la taille écrite.
 * Si l'écriture échoue, quelle qu'en soit la raison, le fichier entamé est retiré.
 */
async function writeLimited(source, file, maxBytes) {
  // Lecture seule : une IA à qui l'on ouvre ce dossier n'a pas à réécrire ce que la personne a joint.
  const out = fs.createWriteStream(file, { flags: 'wx', mode: 0o444 });
  let failure = null;
  out.on('error', (error) => (failure = error));
  let size = 0;
  try {
    // La source n'est pas détruite en cas de refus : la route doit encore pouvoir répondre.
    for await (const chunk of source.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxBytes) throw tooLarge();
      if (failure) throw failure;
      if (!out.write(chunk)) await once(out, 'drain');
    }
    out.end();
    if (!out.closed) await once(out, 'close');
    if (failure) throw failure;
    return size;
  } catch (error) {
    out.destroy();
    // Le fichier n'existe peut-être pas encore : on attend la fermeture avant de le retirer.
    if (!out.closed) await once(out, 'close').catch(() => {});
    // Un nom déjà pris désigne le fichier de quelqu'un d'autre : on n'y touche pas.
    if (error.code !== 'EEXIST') fs.rmSync(file, { force: true });
    throw error;
  }
}

const listDir = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

class Attachments {
  #dir;
  #pending = new Map(); // identifiant -> envoi pas encore rattaché à un message

  constructor({ ATTACHMENTS_DIR }) {
    this.#dir = ATTACHMENTS_DIR;
  }

  dirOf(roomId) {
    return path.join(this.#dir, roomId);
  }

  /** Les dossiers à ouvrir en lecture aux IA d'un salon : le sien, s'il a déjà reçu un fichier. */
  readableDirs(roomId) {
    const dir = this.dirOf(roomId);
    return fs.existsSync(dir) ? [dir] : [];
  }

  /**
   * Reçoit un fichier au fil de l'eau et le garde en attente du message qui le portera.
   * `declaredBytes` est la taille annoncée par la page, si elle en annonce une.
   */
  async receive(roomId, rawName, body, declaredBytes) {
    // Une taille annoncée trop grande est refusée avant d'écrire quoi que ce soit.
    if (declaredBytes > MAX_FILE_BYTES) throw tooLarge();
    const name = sanitizeName(rawName);
    const id = crypto.randomBytes(8).toString('hex');
    const entry = { id, roomId, file: id + storedExtension(name), name, size: 0, at: Date.now(), ready: false };
    fs.mkdirSync(this.dirOf(roomId), { recursive: true });
    // Inscrit dès le début : le ménage ne doit pas emporter un fichier en cours de réception.
    this.#pending.set(id, entry);
    try {
      entry.size = await writeLimited(body, this.#fileOf(entry), MAX_FILE_BYTES);
      if (!entry.size) throw new AppError(400, 'empty_attachment', 'The file is empty.');
    } catch (error) {
      this.#drop(entry);
      throw error;
    }
    entry.ready = true;
    this.#trim(roomId);
    return { id, ...Attachments.#describe(entry) };
  }

  /**
   * Rattache des envois en attente à un message du salon et renvoie ce que le message en garde.
   * Tout ou rien : un identifiant inconnu, ou reçu pour un autre salon, refuse l'ensemble.
   */
  claim(roomId, ids) {
    const wanted = [...new Set(Array.isArray(ids) ? ids.map(String) : [])];
    if (wanted.length > MAX_PER_MESSAGE) throw new AppError(400, 'too_many_attachments', 'Too many files for one message.');
    const entries = wanted.map((id) => {
      const entry = this.#pending.get(id);
      if (!entry || entry.roomId !== roomId || !entry.ready) throw notFound();
      return entry;
    });
    for (const entry of entries) this.#pending.delete(entry.id);
    return entries.map(Attachments.#describe);
  }

  /** Retire un envoi en attente auquel la personne renonce. */
  discard(roomId, id) {
    const entry = this.#pending.get(id);
    if (entry && entry.roomId === roomId && entry.ready) this.#drop(entry);
  }

  /** Le chemin d'un fichier gardé pour un salon, ou une erreur si le nom n'a pas été créé ici. */
  locate(roomId, storedName) {
    if (!STORED_NAME.test(storedName)) throw notFound();
    return path.join(this.dirOf(roomId), storedName);
  }

  deleteRoom(roomId) {
    for (const entry of this.#pending.values()) if (entry.roomId === roomId) this.#pending.delete(entry.id);
    fs.rmSync(this.dirOf(roomId), { recursive: true, force: true });
  }

  /**
   * Retire ce qui ne sert plus : les envois restés trop longtemps sans message, les fichiers
   * qu'aucun message ne porte (après un redémarrage, plus aucun envoi n'est en attente) et
   * les dossiers des salons disparus.
   */
  sweep(rooms) {
    const cutoff = Date.now() - PENDING_MS;
    for (const entry of this.#pending.values()) if (entry.at < cutoff) this.#pending.delete(entry.id);

    const kept = new Map();
    for (const room of rooms) {
      const files = room.messages.flatMap((message) => message.attachments || []).map((attachment) => attachment.file);
      kept.set(room.id, new Set(files));
    }
    for (const entry of this.#pending.values()) kept.get(entry.roomId)?.add(entry.file);

    for (const roomId of listDir(this.#dir)) {
      const files = kept.get(roomId);
      if (!files) fs.rmSync(this.dirOf(roomId), { recursive: true, force: true });
      else for (const file of listDir(this.dirOf(roomId))) if (!files.has(file)) fs.rmSync(path.join(this.dirOf(roomId), file), { force: true });
    }
  }

  /** Fait le ménage maintenant, puis régulièrement. `rooms` renvoie les salons du moment. */
  keepTidy(rooms) {
    const run = () => {
      try {
        this.sweep(rooms());
      } catch (error) {
        console.error('Could not tidy the attachments:', error.message);
      }
    };
    run();
    // unref : ce rendez-vous ne doit pas retenir l'appli quand elle s'arrête.
    setInterval(run, SWEEP_MS).unref();
  }

  #fileOf(entry) {
    return path.join(this.dirOf(entry.roomId), entry.file);
  }

  #drop(entry) {
    this.#pending.delete(entry.id);
    fs.rmSync(this.#fileOf(entry), { force: true });
  }

  /** Un salon ne garde en attente que de quoi remplir un message : les envois les plus anciens cèdent la place. */
  #trim(roomId) {
    const waiting = [...this.#pending.values()].filter((entry) => entry.roomId === roomId && entry.ready);
    for (const entry of waiting.slice(0, Math.max(0, waiting.length - MAX_PER_MESSAGE))) this.#drop(entry);
  }

  /** Ce qu'un message garde d'un fichier joint, et ce que la page en reçoit. */
  static #describe(entry) {
    return {
      name: entry.name,
      kind: isImage(entry.file) ? 'image' : 'file',
      size: entry.size,
      file: entry.file,
      url: `${URL_PREFIX}/${entry.roomId}/${entry.file}`,
    };
  }
}

module.exports = { Attachments, sanitizeName, storedExtension, isImage, writeLimited, URL_PREFIX, LIMITS };
