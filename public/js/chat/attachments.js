// Les fichiers joints au message en cours d'écriture : choisis, déposés sur la conversation
// ou collés. Chacun part tout de suite vers le serveur, puis attend au-dessus du champ
// que le message soit envoyé.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { byId } from '../dom.js';
import { fileSize } from '../format.js';

const carriesFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');

// Certains navigateurs ne disent pas vers quoi le pointeur est parti : on regarde aussi où il est.
const leftThePage = (event) =>
  !event.relatedTarget && (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight);

/**
 * `input` est le champ où l'on colle, `dropZones` les éléments sur lesquels on dépose.
 * `onChange` est appelé chaque fois que la liste des fichiers en attente change.
 */
export function createAttachments({ store, input, dropZones, onChange }) {
  const list = byId('attachments');
  const error = byId('attach-error');
  const dropHint = byId('drop-hint');
  const picker = byId('attach-input');
  const waiting = new Map(); // salon -> fichiers qui partiront avec son prochain message

  // Les limites du serveur, pour refuser sans attendre un fichier qu'il refuserait de toute façon.
  let limits = null;
  api.attachmentLimits().then((value) => (limits = value), () => {});

  const itemsOf = (roomId) => waiting.get(roomId) || [];
  const current = () => itemsOf(store.currentId);

  function showError(text) {
    error.textContent = text;
    error.hidden = !text;
  }

  function paintProgress(item) {
    if (item.bar) item.bar.style.width = Math.round(item.progress * 100) + '%';
  }

  function chip(roomId, item) {
    const el = document.createElement('li');
    el.className = 'chip';
    if (item.preview) {
      const image = document.createElement('img');
      image.src = item.preview;
      image.alt = '';
      el.append(image);
    }
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = item.name;
    const size = document.createElement('span');
    size.className = 'chip-size';
    size.textContent = fileSize(item.size);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn small ghost';
    remove.textContent = '✕';
    remove.title = t('attach.remove', { name: item.name });
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => discard(roomId, item));
    el.append(name, size, remove);
    item.bar = null;
    if (!item.id) {
      item.bar = document.createElement('i');
      item.bar.className = 'chip-bar';
      paintProgress(item);
      el.append(item.bar);
    }
    return el;
  }

  function render() {
    const items = current();
    list.replaceChildren(...items.map((item) => chip(store.currentId, item)));
    list.hidden = !items.length;
  }

  function changed() {
    render();
    onChange();
  }

  /** Retire un fichier de la liste de son salon. Renvoie false s'il n'y était déjà plus. */
  function forget(roomId, item) {
    const items = itemsOf(roomId);
    if (!items.includes(item)) return false;
    waiting.set(roomId, items.filter((other) => other !== item));
    if (item.preview) URL.revokeObjectURL(item.preview);
    return true;
  }

  /** La personne renonce à un fichier : l'envoi en cours s'arrête, la copie du serveur est retirée. */
  function discard(roomId, item) {
    forget(roomId, item);
    if (item.id) api.discardAttachment(roomId, item.id).catch(() => {});
    else item.abort();
    changed();
  }

  function upload(roomId, file) {
    const item = {
      name: file.name,
      size: file.size,
      // L'aperçu vient du fichier local : rien n'est redemandé au serveur.
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      progress: 0,
      id: null, // donné par le serveur une fois le fichier reçu
      bar: null,
    };
    const sending = api.uploadAttachment(roomId, file, (part) => {
      item.progress = part;
      paintProgress(item);
    });
    item.abort = sending.abort;
    waiting.set(roomId, [...itemsOf(roomId), item]);
    sending.done
      .then(
        (saved) => (item.id = saved.id),
        // Un envoi auquel la personne a renoncé n'est pas une erreur à lui signaler.
        (err) => forget(roomId, item) && showError(t('attach.failed', { name: item.name, reason: err.message })),
      )
      .finally(changed);
  }

  function add(files) {
    const roomId = store.currentId;
    if (!roomId || !files.length) return;
    const problems = [];
    for (const file of files) {
      if (limits && itemsOf(roomId).length >= limits.maxPerMessage) {
        problems.push(t('attach.tooMany', { max: limits.maxPerMessage }));
        break;
      }
      if (!file.size) problems.push(t('attach.empty', { name: file.name }));
      else if (limits && file.size > limits.maxFileBytes) problems.push(t('attach.tooBig', { name: file.name, max: fileSize(limits.maxFileBytes) }));
      else upload(roomId, file);
    }
    showError(problems.join(' '));
    changed();
  }

  byId('attach').addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    add([...picker.files]);
    // Vidé pour que choisir deux fois de suite le même fichier le joigne deux fois.
    picker.value = '';
  });

  input.addEventListener('paste', (event) => {
    const data = event.clipboardData;
    // Du texte copié depuis un tableur arrive avec son image : dans ce cas, c'est le texte qu'on colle.
    if (!data || !data.files.length || data.types.includes('text/plain')) return;
    event.preventDefault();
    add([...data.files]);
  });

  const overDropZone = (event) => !!store.currentId && dropZones.some((zone) => zone.contains(event.target));

  function highlight(on) {
    dropHint.hidden = !on;
    for (const zone of dropZones) zone.classList.toggle('dropping', on);
  }

  // Écouté sur toute la page : un fichier lâché à côté de la conversation ne doit pas
  // remplacer Tandem dans l'onglet.
  document.addEventListener('dragover', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    const accepted = overDropZone(event);
    event.dataTransfer.dropEffect = accepted ? 'copy' : 'none';
    highlight(accepted);
  });
  document.addEventListener('dragleave', (event) => {
    if (leftThePage(event)) highlight(false);
  });
  document.addEventListener('drop', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    highlight(false);
    if (overDropZone(event)) add([...event.dataTransfer.files]);
  });

  return {
    /** Les identifiants des fichiers du salon affiché que le serveur a reçus. */
    ids: () => current().filter((item) => item.id).map((item) => item.id),

    /** Vrai tant qu'un fichier du salon affiché est en route vers le serveur. */
    isUploading: () => current().some((item) => !item.id),

    /** Vrai si un fichier attend d'être envoyé, dans n'importe quel salon. */
    hasAny: () => [...waiting.values()].some((items) => items.length > 0),

    /** Vide la liste d'un salon dont le message est parti avec ses fichiers. */
    clear(roomId) {
      for (const item of itemsOf(roomId)) if (item.preview) URL.revokeObjectURL(item.preview);
      waiting.delete(roomId);
      showError('');
      changed();
    },

    /** Montre les fichiers en attente du salon affiché : chaque salon a les siens. */
    showRoom() {
      showError('');
      changed();
    },
  };
}
