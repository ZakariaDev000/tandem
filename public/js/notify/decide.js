// Faut-il prévenir la personne, et comment ? Tout se décide ici, sans toucher au navigateur.
import { SYSTEM } from '../participants.js';
import { handedBackBy, isBusy } from '../room-state.js';

/** Un tour qui échoue mérite une alerte ; un arrêt demandé par la personne, non. */
export function alertForMessage(message) {
  return message.from === SYSTEM && message.code === 'failed' ? { kind: 'failed', agent: message.agent } : null;
}

/** L'échange d'un salon est terminé quand un agent a rendu la main et que plus rien n'attend. */
export function alertForSettledRoom(room) {
  const agent = isBusy(room) ? null : handedBackBy(room);
  return agent ? { kind: 'done', agent } : null;
}

/**
 * Les moyens à employer pour un événement. Aucun si la personne a déjà le salon sous les yeux ;
 * la notification du navigateur demande en plus son réglage et la permission du navigateur.
 */
export function channelsFor({ watching, desktop, sound, permission }) {
  if (watching) return { desktop: false, sound: false };
  return { desktop: !!desktop && permission === 'granted', sound: !!sound };
}
