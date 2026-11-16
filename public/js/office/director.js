// Le régisseur : il traduit ce qui se passe dans le salon en déplacements des personnages.
// Qui porte un message à qui, qui travaille et où, et qui peut s'accorder une pause. Aucun dessin ici.
import { AGENT_IDS, PARTICIPANT_IDS, USER } from '../participants.js';
import { advance, carryMessage, createActor, cutBreak, goHome, isSpeaking, sendHome, setStation, setWorkState } from './actors.js';
import { createIdleLife } from './idle.js';
import { MEET } from './layout.js';
import { placeOf } from './routes.js';

/**
 * `instant` : les trajets se font d'un coup et personne ne prend de pause (mouvements réduits).
 * `random` : la source de hasard des pauses, comme Math.random.
 */
export function createDirector({ instant, random }) {
  const actors = Object.fromEntries(PARTICIPANT_IDS.map((id) => [id, createActor(id)]));
  const cast = Object.values(actors);
  const idleLife = instant ? null : createIdleLife({ random });

  /**
   * Deux agents qui travaillent en même temps s'installent à la table. Celui qui y est
   * y reste tant qu'il travaille ; dès qu'il a fini, son poste redevient son bureau.
   * On en décide à chaque image et non à chaque annonce : la page annonce les agents un par un,
   * et entre deux annonces l'état peut laisser croire à tort qu'ils travaillent ensemble.
   */
  function seatAgents() {
    const together = AGENT_IDS.every((id) => actors[id].working);
    for (const id of AGENT_IDS) {
      const actor = actors[id];
      const stays = actor.working && (together || actor.station === 'table');
      setStation(actor, stays ? 'table' : 'home');
    }
  }

  /**
   * La bulle s'étale du côté opposé à celui à qui on parle, pour ne pas le cacher.
   * Face à la personne, ou face aux deux agents, elle reste centrée.
   */
  function leanOf(from, to, spot) {
    const listener = actors[to];
    if (!listener || (from !== USER && to === USER)) return '';
    return placeOf(to, listener.station).x < spot.x ? 'right' : 'left';
  }

  return {
    actors,

    /** Un personnage va porter son message (déjà réduit à une bulle) à son destinataire. */
    deliver(from, to, text, image) {
      const actor = actors[from];
      const spot = MEET[from] && MEET[from][to];
      if (!actor || !spot) return;
      for (const other of cast) {
        if (other === actor) continue;
        // Une seule bulle à la fois : celui qui parlait encore retourne à sa place.
        if (isSpeaking(other)) goHome(other);
        // Et chacun est à sa place pour l'écouter : les pauses s'arrêtent là.
        cutBreak(other);
      }
      carryMessage(actor, spot, text, image, leanOf(from, to, spot));
    },

    /** Dit si un agent travaille, et ce qu'il fait ; `activity` omis garde le texte en place. */
    setWorking(id, working, activity) {
      const actor = actors[id];
      if (actor) setWorkState(actor, working, activity);
    },

    /** Remet tout le monde à sa place. */
    reset() {
      cast.forEach(sendHome);
    },

    /** Fait vivre la scène pendant `dt` secondes ; `now` est l'heure, en millisecondes. */
    advance(dt, now) {
      seatAgents();
      for (const actor of cast) advance(actor, dt, now, instant);
      if (idleLife) idleLife.update(cast, now);
    },
  };
}
