// Les personnages en tant qu'état : où ils sont, où ils vont, ce qu'ils disent.
// Aucun dessin ici ; characters.js et bubbles.js lisent cet état pour l'afficher.
import { isAgent } from '../participants.js';
import { HOME, TABLE } from './layout.js';
import { routeToSpot, routeToStation } from './routes.js';

const SPEED = 58; // pixels de scène par seconde

// Durée d'une bulle : le temps de la lire, entre un minimum et un maximum.
const READ_MS_PER_CHAR = 55;
const MIN_TALK_MS = 3800;
const MAX_TALK_MS = 9000;

export function createActor(id) {
  return {
    id,
    pos: { ...HOME[id] },
    path: [],
    mode: 'home', // home | going | talking | returning
    station: 'home', // où il s'installe : home (son bureau, son tapis) | table
    working: false,
    activity: '',
    say: '',
    sayImage: '',
    lean: '',
    sayUntil: 0,
    step: 0,
  };
}

/** Assis à son poste. La personne, elle, reste debout sur le tapis. */
export const isSeated = (actor) => isAgent(actor.id) && actor.mode === 'home';

/** Au travail, installé à son poste. */
export const isAtWork = (actor) => actor.working && actor.mode === 'home';

/** Installé à la table de réunion. */
export const isAtTable = (actor) => actor.station === 'table' && actor.mode === 'home';

/** À la table, le côté où il est assis : ses étiquettes s'écartent de ce côté pour ne pas couvrir son voisin. */
export const tableSide = (actor) => (!isAtTable(actor) ? '' : actor.pos.x < TABLE.x ? 'left' : 'right');

/** En train de porter ou de dire un message. */
export const isSpeaking = (actor) => actor.mode === 'going' || actor.mode === 'talking';

export const isWalking = (actor) => actor.path.length > 0;

export function goHome(actor) {
  if (actor.mode === 'home') return;
  actor.path = routeToStation(actor.id, actor.pos, actor.station);
  actor.mode = 'returning';
  actor.say = '';
}

/** Change de poste : son bureau, ou la table de réunion. */
export function setStation(actor, station) {
  if (station === actor.station) return;
  actor.station = station;
  // Assis ou déjà en chemin vers son poste, il part pour le nouveau. Sinon il le rejoindra en rentrant.
  if (actor.mode === 'home' || actor.mode === 'returning') {
    actor.path = routeToStation(actor.id, actor.pos, station);
    actor.mode = 'returning';
  }
}

/** Envoie un personnage dire `text` à l'endroit `spot`. `lean` : le côté où sa bulle s'étale. */
export function carryMessage(actor, spot, text, image, lean) {
  actor.path = routeToSpot(actor.id, actor.pos, spot);
  actor.mode = 'going';
  actor.say = text;
  actor.sayImage = image || '';
  actor.lean = lean;
}

export function setWorkState(actor, working, activity) {
  // Un nouveau tour de travail ne reprend pas l'action du précédent.
  if (working && !actor.working) actor.activity = '';
  actor.working = working;
  if (activity !== undefined) actor.activity = activity;
  // Qui se met au travail retourne d'abord s'asseoir.
  if (working && actor.mode !== 'home' && actor.mode !== 'returning') goHome(actor);
}

/** Remet le personnage à sa place, sans trajet. */
export function sendHome(actor) {
  actor.pos = { ...HOME[actor.id] };
  actor.path = [];
  actor.mode = 'home';
  actor.station = 'home';
  actor.working = false;
  actor.activity = '';
  actor.say = '';
}

function walk(actor, dt, instant) {
  // Un agent attendu à son poste presse le pas.
  let budget = instant ? Infinity : SPEED * dt * (actor.working ? 2 : 1);
  while (actor.path.length && budget > 0) {
    const next = actor.path[0];
    const dx = next.x - actor.pos.x;
    const dy = next.y - actor.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= budget) {
      actor.pos.x = next.x;
      actor.pos.y = next.y;
      actor.path.shift();
      budget -= dist;
    } else {
      actor.pos.x += (dx / dist) * budget;
      actor.pos.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  actor.step += dt * 60;
}

function arrive(actor, now) {
  if (actor.mode === 'going') {
    actor.mode = 'talking';
    actor.sayUntil = now + Math.max(MIN_TALK_MS, Math.min(MAX_TALK_MS, actor.say.length * READ_MS_PER_CHAR));
  } else if (actor.mode === 'returning') actor.mode = 'home';
}

/**
 * Fait avancer le personnage de `dt` secondes : il marche le long de son trajet,
 * parle une fois arrivé, puis rentre quand sa bulle a été lue.
 * Avec `instant`, les trajets se font d'un coup (mouvements réduits).
 */
export function advance(actor, dt, now, instant) {
  if (isWalking(actor)) {
    walk(actor, dt, instant);
    if (!isWalking(actor)) arrive(actor, now);
  } else if (actor.mode === 'talking' && now > actor.sayUntil) {
    goHome(actor);
  }
}
