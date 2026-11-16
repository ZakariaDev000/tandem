// Le fil de la conversation du salon affiché, avec la ligne « en train de… » tout en bas.
import { t } from '../i18n/index.js';
import { byId } from '../dom.js';
import { actionText, displayName } from '../format.js';
import { messageElement } from './message.js';

export function createThread({ store }) {
  const thread = byId('thread');

  function scrollDown() {
    thread.scrollTop = thread.scrollHeight;
  }

  // Une image qui finit de charger allonge le fil : on reste en bas.
  const element = (message) => messageElement(message, { onImageLoad: scrollDown });

  /** Montre ce que fait l'agent en cours, ou retire la ligne si personne ne travaille. */
  function renderLive() {
    const room = store.current();
    let row = thread.querySelector('.live');
    if (!room || !room.running) {
      if (row) row.remove();
      return;
    }
    if (!row) {
      row = document.createElement('div');
      row.className = 'live';
      row.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>';
    }
    // Toujours remise à la fin : les nouveaux messages passent au-dessus.
    thread.append(row);
    row.lastChild.textContent = displayName(room.running) + ' : ' + (actionText(store.liveAction(room.id)) || t('office.thinking'));
  }

  function render() {
    const room = store.current();
    thread.textContent = '';
    if (!room) return;
    if (!room.messages.length) {
      const empty = document.createElement('p');
      empty.className = 'thread-empty';
      empty.textContent = t('chat.empty');
      thread.append(empty);
    }
    for (const message of room.messages) thread.append(element(message));
    renderLive();
    scrollDown();
  }

  /** Ajoute un message qui vient d'arriver dans le salon affiché. */
  function append(message) {
    const empty = thread.querySelector('.thread-empty');
    if (empty) empty.remove();
    thread.append(element(message));
    renderLive();
  }

  return { render, append, renderLive, scrollDown };
}
