// Les notifications dans la fenêtre des réglages : les deux interrupteurs, et ce que le navigateur autorise.
import { t } from '../i18n/index.js';
import { byId } from '../dom.js';

// Le nom de l'appli est une marque : il ne se traduit pas.
const APP_NAME = 'Tandem';

export function initNotifySettings({ notifier }) {
  const desktop = byId('notify-desktop');
  const sound = byId('notify-sound');
  const state = byId('notify-state');

  function render() {
    const permission = notifier.permission();
    desktop.checked = notifier.desktop;
    desktop.disabled = permission === 'unsupported';
    sound.checked = notifier.sound;
    state.textContent = t('notify.permission.' + permission);
    state.className = permission === 'denied' ? 'error' : 'note';
  }

  desktop.addEventListener('change', async () => {
    const on = await notifier.setDesktop(desktop.checked);
    render();
    if (on) notifier.preview({ title: APP_NAME, body: t('notify.enabled') });
  });
  sound.addEventListener('change', () => notifier.setSound(sound.checked));
  // La permission a pu changer dans les réglages du navigateur depuis la dernière ouverture.
  byId('open-settings').addEventListener('click', render);
  render();
}
