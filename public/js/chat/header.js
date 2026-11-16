// L'en-tête du salon affiché : titre, dossier, état, et les boutons pause, arrêt, suppression.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { byId } from '../dom.js';
import { displayName } from '../format.js';
import { USER, isAgent } from '../participants.js';

const isBusy = (room) => room.running.length > 0 || room.queue.length > 0;

function folderLabel(room) {
  const notes = [room.access === 'read' && !room.ownFolder && t('room.readOnly'), room.archived && t('room.archived')].filter(Boolean);
  const folder = room.ownFolder ? t('room.noFolder') : '…/' + room.cwd.split('/').filter(Boolean).slice(-2).join('/');
  return [folder, ...notes].join(' · ');
}

/** L'état d'un salon en une phrase. `tone` choisit la couleur de l'étiquette. */
function roomStatus(room) {
  const last = room.messages[room.messages.length - 1];
  if (room.stopping) return { text: t('status.stopping') };
  // Un agent seul donne sa couleur à l'étiquette ; à deux, elle reste neutre.
  if (room.running.length === 1) return { text: t('status.working', { name: displayName(room.running[0]) }), tone: room.running[0] };
  if (room.running.length > 1) return { text: t('status.workingTogether', { names: room.running.map(displayName).join(' + ') }) };
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
