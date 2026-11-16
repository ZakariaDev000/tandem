// Les mises à jour vues de la page : le bandeau sous la barre du haut, et le réglage
// « installer automatiquement » dans la fenêtre des réglages.
import { t } from './i18n/index.js';
import * as api from './api.js';
import { byId } from './dom.js';

/** Ce qu'il faut dire d'une mise à jour, ou rien s'il n'y a rien à signaler. */
function describe(update) {
  switch (update.status) {
    case 'available':
      return t(update.behind === 1 ? 'update.availableOne' : 'update.availableMany', { n: update.behind });
    case 'pending':
      return t('update.pending');
    case 'installing':
      return t('update.installing');
    case 'blocked':
      return t('update.blocked.' + update.blockedBy);
    default:
      return '';
  }
}

/** L'état des mises à jour en une phrase, pour la fenêtre des réglages. */
function statusLine(update) {
  if (!update.supported) return t('update.unsupported.' + update.reason);
  if (update.status === 'error') return t('update.checkFailed');
  return describe(update) || t('update.upToDate', { version: update.version || '…' });
}

/**
 * `hasDraft` dit si un message est en cours d'écriture : on ne recharge pas la page
 * sous les doigts de quelqu'un, on le lui propose.
 */
export function createUpdateUi({ hasDraft }) {
  const banner = byId('update-banner');
  const bannerText = byId('update-banner-text');
  const bannerAction = byId('update-banner-action');
  const dialog = byId('settings-dialog');
  const autoUpdate = byId('auto-update');
  const status = byId('update-status');

  let update = { supported: true, status: 'idle' };
  let serverStartedAt = null;
  let reloadNeeded = false;
  let action = null;

  function render() {
    // Une page restée ouverte pendant une mise à jour tourne encore avec l'ancien code.
    const text = reloadNeeded ? t('update.reload') : describe(update);
    action = reloadNeeded ? () => location.reload() : update.status === 'available' ? api.applyUpdate : null;
    banner.hidden = !text;
    bannerText.textContent = text;
    bannerAction.hidden = !action;
    bannerAction.textContent = reloadNeeded ? t('update.reloadNow') : t('update.installNow');
    status.textContent = statusLine(update);
  }

  bannerAction.addEventListener('click', () => action && action());
  byId('open-settings').addEventListener('click', () => dialog.showModal());
  byId('update-check').addEventListener('click', () => api.checkForUpdate().catch(() => {}));
  autoUpdate.addEventListener('change', () => {
    api.saveSettings({ autoUpdate: autoUpdate.checked }).catch(() => {
      // Le réglage n'a pas été enregistré : l'interrupteur revient à sa position.
      autoUpdate.checked = !autoUpdate.checked;
    });
  });

  return {
    /** À chaque connexion au serveur. Un serveur qui a redémarré peut avoir changé de version. */
    onHello({ settings, update: current, startedAt }) {
      if (serverStartedAt !== null && startedAt !== serverStartedAt) {
        if (!hasDraft()) return location.reload();
        reloadNeeded = true;
      }
      serverStartedAt = startedAt;
      autoUpdate.checked = settings.autoUpdate;
      update = current;
      render();
    },
    onSettings(settings) {
      autoUpdate.checked = settings.autoUpdate;
    },
    onUpdate(current) {
      update = current;
      render();
    },
  };
}
