// L'en-tête du salon affiché : titre, dossier, état, et les boutons pause, arrêt, suppression.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { byId } from '../dom.js';
import { displayName } from '../format.js';
import { USER, isAgent } from '../participants.js';

const isBusy = (room) => !!room.running || room.queue.length > 0;

function folderLabel(room) {
  if (room.ownFolder) return t('room.noFolder');
  const tail = room.cwd.split('/').filter(Boolean).slice(-2).join('/');
  return '…/' + tail + (room.access === 'read' ? ' · ' + t('room.readOnly') : '');
}

/** L'état d'un salon en une phrase. `tone` choisit la couleur de l'étiquette. */
function roomStatus(room) {
  const last = room.messages[room.messages.length - 1];
  if (room.stopping) return { text: t('status.stopping') };
  if (room.running) return { text: t('status.working', { name: displayName(room.running) }), tone: room.running };
  if (room.paused && room.queue.length) return { text: t('status.paused') };
  // Le dernier mot est celui d'un agent qui s'adresse à la personne : ils ont fini entre eux.
  if (last && isAgent(last.from) && last.to === USER) return { text: t('status.done'), tone: 'done' };
  return { text: room.messages.length ? t('status.waiting') : t('status.ready') };
}

const reportError = (err) => alert(err.message);

export function createHeader({ store }) {
  const title = byId('room-title');
  const folder = byId('room-cwd');
  const status = byId('status');
  const pause = byId('pause');
  const stop = byId('stop');

  pause.addEventListener('click', () => {
    const room = store.current();
    if (room) api.setPaused(room.id, !room.paused).catch(reportError);
  });

  stop.addEventListener('click', () => {
    const room = store.current();
    if (room) api.stopRoom(room.id).catch(reportError);
  });

  byId('delete').addEventListener('click', () => {
    const room = store.current();
    if (!room) return;
    const note = room.ownFolder ? '' : '\n' + t('delete.keepFolder');
    if (confirm(t('delete.confirm', { title: room.title }) + note)) api.deleteRoom(room.id).catch(reportError);
  });

  function render() {
    const room = store.current();
    if (!room) return;
    title.textContent = room.title;
    folder.textContent = folderLabel(room);
    folder.title = room.cwd;
    const { text, tone } = roomStatus(room);
    status.textContent = text;
    status.className = tone ? 'status ' + tone : 'status';
    // Pendant l'arrêt, il n'y a plus rien à mettre en pause ni à arrêter.
    const idle = !isBusy(room) || !!room.stopping;
    pause.hidden = idle;
    pause.textContent = room.paused ? t('control.resume') : t('control.pause');
    stop.hidden = idle;
  }

  return { render };
}
