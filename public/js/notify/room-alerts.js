// Ce qui, dans la vie d'un salon, mérite de prévenir la personne : un échange terminé, un tour en échec.
import { t } from '../i18n/index.js';
import { displayName } from '../format.js';
import { isBusy } from '../room-state.js';
import { alertForMessage, alertForSettledRoom } from './decide.js';

// Entre deux tours d'un même échange, un salon paraît libre un court instant : on attend qu'il le reste.
const SETTLE_MS = 400;

/** `notify` reçoit { title, body, roomId } : c'est le point d'entrée du module notifier. */
export function createRoomAlerts({ store, notify }) {
  const settling = new Map(); // salon -> vérification en attente

  function announce(room, alert) {
    notify({ title: room.title, body: t('notify.' + alert.kind, { name: displayName(alert.agent) }), roomId: room.id });
  }

  function cancel(roomId) {
    clearTimeout(settling.get(roomId));
    settling.delete(roomId);
  }

  return {
    /** Un message vient d'arriver dans ce salon. */
    onMessage(room, message) {
      const alert = alertForMessage(message);
      if (alert) announce(room, alert);
    },

    /** L'état d'un salon vient de changer ; `wasBusy` dit s'il occupait les agents juste avant. */
    onRoomChange(room, wasBusy) {
      if (isBusy(room)) return cancel(room.id);
      if (!wasBusy || settling.has(room.id)) return;
      const check = () => {
        settling.delete(room.id);
        const settled = store.get(room.id);
        const alert = settled && alertForSettledRoom(settled);
        if (alert) announce(settled, alert);
      };
      settling.set(room.id, setTimeout(check, SETTLE_MS));
    },
  };
}
