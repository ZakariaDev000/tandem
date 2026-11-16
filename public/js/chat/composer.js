// La zone d'écriture : le choix du destinataire, le champ de texte et l'envoi.
import * as api from '../api.js';
import { byId } from '../dom.js';
import { BOTH } from '../participants.js';

const MAX_HEIGHT = 160;

export function createComposer({ store, onTargetChange }) {
  const form = byId('composer');
  const input = byId('input');
  const targetButtons = form.querySelectorAll('.targets button');
  const parallelSwitch = byId('parallel-switch');
  const parallelBox = byId('parallel');
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    const roomId = store.currentId;
    if (!text || !roomId) return;
    input.value = '';
    autosize();
    try {
      await api.sendMessage(roomId, { to: target, text, parallel: target === BOTH && parallelBox.checked });
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
  };
}
