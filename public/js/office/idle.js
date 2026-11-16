// La petite vie du bureau : un personnage qui attend s'accorde de temps en temps une pause,
// rare et courte. Le hasard est fourni par l'appelant, pour que tout soit rejouable.
import { isAgent } from '../participants.js';
import { isOnBreak, isResting, isSpeaking, strikePose, takeBreak } from './actors.js';

// Le temps passé à sa place avant une pause, tiré entre ces deux bornes.
export const REST_MS = { min: 45000, max: 120000 };

// Une pause : aller à `place` et y rester `lingerMs`, ou prendre une pose sans bouger.
// `pose` est ce qu'on y fait, `takes` ce qu'on en rapporte.
const BREAKS = {
  coffee: { place: 'coffee', lingerMs: 2200, takes: 'cup' },
  window: { place: 'window', lingerMs: 4200, pose: 'back' },
  stretch: { pose: 'stretch', lingerMs: 1600 },
  tap: { pose: 'tap', lingerMs: 1400 },
};

// La personne ne quitte pas son tapis : on doit toujours savoir où la trouver.
const AGENT_BREAKS = ['coffee', 'window', 'stretch'];
const USER_BREAKS = ['tap'];

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

function begin(actor, name, now) {
  const outing = BREAKS[name];
  if (outing.place) takeBreak(actor, outing.place, outing);
  else strikePose(actor, outing.pose, now + outing.lingerMs);
}

/** `random` renvoie un nombre dans [0, 1[, comme Math.random. */
export function createIdleLife({ random }) {
  const dueAt = new Map(); // personnage -> heure de sa prochaine pause

  return {
    /** À appeler à chaque image : lance une pause quand le moment est venu pour quelqu'un. */
    update(cast, now) {
      // Jamais pendant qu'un message est porté ou dit, et une seule pause à la fois :
      // tant que ce n'est pas le cas, personne ne compte son temps de repos.
      let quiet = !cast.some(isSpeaking) && !cast.some(isOnBreak);
      for (const actor of cast) {
        if (!quiet || !isResting(actor)) {
          dueAt.delete(actor.id);
        } else if (!dueAt.has(actor.id)) {
          dueAt.set(actor.id, now + REST_MS.min + random() * (REST_MS.max - REST_MS.min));
        } else if (now >= dueAt.get(actor.id)) {
          dueAt.delete(actor.id);
          begin(actor, pick(isAgent(actor.id) ? AGENT_BREAKS : USER_BREAKS, random), now);
          quiet = false;
        }
      }
    },
  };
}
