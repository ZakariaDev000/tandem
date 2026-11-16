// Les personnages en tant qu'état : où ils sont, où ils vont, ce qu'ils disent.
// Aucun dessin ici ; characters.js et bubbles.js lisent cet état pour l'afficher.
import { isAgent, USER } from '../participants.js';
import { EXIT, HOME, MEET } from './layout.js';

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
    working: false,
    activity: '',
    say: '',
    sayImage: '',
    lean: '',
    sayUntil: 0,
    step: 0,
  };
}

/** Assis à son bureau. La personne, elle, reste debout sur le tapis. */
export const isSeated = (actor) => isAgent(actor.id) && actor.mode === 'home';

/** Au travail devant son écran. */
export const isAtWork = (actor) => actor.working && actor.mode === 'home';

/** En train de porter ou de dire un message. */
export const isSpeaking = (actor) => actor.mode === 'going' || actor.mode === 'talking';

export const isWalking = (actor) => actor.path.length > 0;

// Les trajets se font à angle droit. Un agent assis sort d'abord de son bureau par le côté.
function routeTo(actor, to) {
  const exit = EXIT[actor.id];
  if (exit && actor.mode === 'home') return [{ ...exit }, { x: exit.x, y: to.y }, { ...to }];
  return [{ x: actor.pos.x, y: to.y }, { ...to }];
}

function routeHome(actor) {
  const home = HOME[actor.id];
  const exit = EXIT[actor.id];
  if (exit) return [{ x: exit.x, y: actor.pos.y }, { ...exit }, { ...home }];
  return [{ x: home.x, y: actor.pos.y }, { ...home }];
}

export function goHome(actor) {
  if (actor.mode === 'home') return;
  actor.path = routeHome(actor);
  actor.mode = 'returning';
  actor.say = '';
}

/** Où `from` se place pour parler à `to`, ou rien si cette rencontre n'existe pas. */
export const meetingSpot = (from, to) => MEET[from] && MEET[from][to];

/** Envoie un personnage porter son message à `to`, à l'endroit `spot`. */
export function carryMessage(actor, to, spot, text, image) {
  actor.path = routeTo(actor, spot);
  actor.mode = 'going';
  actor.say = text;
  actor.sayImage = image || '';
  // La bulle s'étale du côté opposé à celui à qui on parle, pour ne pas le cacher.
  // Face à la personne, ou face aux deux agents, elle reste centrée.
  const listener = HOME[to];
  const centered = !listener || (actor.id !== USER && to === USER);
  actor.lean = centered ? '' : listener.x < spot.x ? 'right' : 'left';
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
  actor.working = false;
  actor.activity = '';
  actor.say = '';
}

/**
 * Fait avancer le personnage de `dt` secondes : il marche le long de son trajet,
 * parle une fois arrivé, puis rentre quand sa bulle a été lue.
 * Avec `instant`, les trajets se font d'un coup (mouvements réduits).
 */
export function advance(actor, dt, now, instant) {
  if (isWalking(actor)) {
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
    if (!isWalking(actor)) {
      if (actor.mode === 'going') {
        actor.mode = 'talking';
        actor.sayUntil = now + Math.max(MIN_TALK_MS, Math.min(MAX_TALK_MS, actor.say.length * READ_MS_PER_CHAR));
      } else if (actor.mode === 'returning') actor.mode = 'home';
    }
  } else if (actor.mode === 'talking' && now > actor.sayUntil) {
    goHome(actor);
  }
}
