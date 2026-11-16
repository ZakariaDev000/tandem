// La zone d'écriture : le choix du destinataire, le champ de texte et l'envoi.
// Les fichiers joints sont l'affaire de attachments.js.
import * as api from '../api.js';
import { byId } from '../dom.js';
import { BOTH } from '../participants.js';
import { createAttachments } from './attachments.js';

const MAX_HEIGHT = 160;

export function createComposer({ store, onTargetChange }) {
  const form = byId('composer');
  const input = byId('input');
  const targetButtons = form.querySelectorAll('.targets button');
  const parallelSwitch = byId('parallel-switch');
  const parallelBox = byId('parallel');
  const send = byId('send');
  let target = BOTH;

  function setTarget(next) {
    target = next;
    for (const button of targetButtons) button.setAttribute('aria-checked', String(button.dataset.to === next));
    // Répondre en parallèle n'a de sens qu'en écrivant aux deux.
    parallelSwitch.hidden = next !== BOTH;
    onTargetChange(next);
  }

  /** Le champ grandit avec le texte, jusqu'à une hauteur limite. */
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(MAX_HEIGHT, input.scrollHeight + 4) + 'px';
  }

  // Tant qu'un fichier est en route vers le serveur, le message ne peut pas partir sans lui.
  const attachments = createAttachments({
    store,
    input,
    dropZones: [byId('thread'), form],
    onChange: () => (send.disabled = attachments.isUploading()),
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    const roomId = store.currentId;
    const attached = attachments.ids();
    if (!roomId || attachments.isUploading() || (!text && !attached.length)) return;
    input.value = '';
    autosize();
    try {
      await api.sendMessage(roomId, { to: target, text, parallel: target === BOTH && parallelBox.checked, attachments: attached });
      // Les fichiers ne quittent la zone d'écriture qu'une fois le message parti.
      attachments.clear(roomId);
    } catch (err) {
      // Le texte n'est pas parti : on le rend pour ne pas le perdre.
      input.value = text;
      alert(err.message);
    }
  });

  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (event) => {
    // Entrée envoie, Maj+Entrée va à la ligne. On laisse passer la validation d'une saisie composée.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  for (const button of targetButtons) button.addEventListener('click', () => setTarget(button.dataset.to));
  setTarget(BOTH);

  return {
    /** Choisit un agent comme destinataire ; le choisir une seconde fois revient à écrire aux deux. */
    toggleTarget(id) {
      setTarget(target === id ? BOTH : id);
    },
    focus() {
      input.focus();
    },
    /** Vrai si un message est en cours d'écriture. */
    hasDraft() {
      return input.value.trim().length > 0 || attachments.hasAny();
    },
    /** À appeler quand le salon affiché change : chaque salon a ses fichiers en attente. */
    showRoom() {
      attachments.showRoom();
    },
  };
}
