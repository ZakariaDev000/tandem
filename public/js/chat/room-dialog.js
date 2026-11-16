// La fenêtre « Nouveau salon » : sujet, dossier de travail et droits sur ce dossier.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { byId } from '../dom.js';
import { dayAndMonth } from '../format.js';

/** Branche la fenêtre et ses boutons d'ouverture. `onCreated` reçoit le salon créé par le serveur. */
export function initRoomDialog({ onCreated }) {
  const dialog = byId('dialog');
  const form = byId('room-form');
  const title = byId('f-title');
  const folder = byId('f-cwd');
  const error = byId('f-error');

  function open() {
    form.reset();
    error.hidden = true;
    dialog.showModal();
    title.focus();
  }

  for (const id of ['new-room', 'empty-new']) byId(id).addEventListener('click', open);
  byId('f-cancel').addEventListener('click', () => dialog.close());

  byId('f-pick').addEventListener('click', async () => {
    // Un échec ici ne bloque rien : le chemin peut toujours être saisi à la main.
    try {
      const path = await api.pickFolder(t('dialog.pickPrompt'));
      if (path) folder.value = path;
    } catch {}
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const room = await api.createRoom({
        title: title.value.trim() || t('room.defaultTitle', { date: dayAndMonth(new Date()) }),
        cwd: folder.value,
        access: new FormData(form).get('access'),
      });
      dialog.close();
      onCreated(room);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}
