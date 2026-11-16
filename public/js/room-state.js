// Ce que les données d'un salon disent de son état. Rien ici ne touche à la page.
import { USER, isAgent } from './participants.js';

/** Vrai tant qu'un agent répond ou attend son tour. */
export const isBusy = (room) => room.running.length > 0 || room.queue.length > 0;

/** L'agent qui a rendu la main à la personne : le dernier mot est le sien, et il s'adresse à elle. */
export function handedBackBy(room) {
  const last = room.messages[room.messages.length - 1];
  return last && isAgent(last.from) && last.to === USER ? last.from : null;
}
