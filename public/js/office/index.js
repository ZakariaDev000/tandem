// Le bureau de Tandem : une petite scène en pixels dessinée à la main dans un canvas.
// Trois personnages : Claude et ChatGPT à leur bureau, la personne sur le tapis.
// Ici, seulement la boucle d'animation et de quoi piloter la scène ; director.js décide
// des déplacements, frame.js dessine, looks.js dit à quoi ressemble chacun.
import { AGENT_IDS, BOTH, isAgent, PARTICIPANT_IDS, USER } from '../participants.js';
import { bubbleText, createBubbles } from './bubbles.js';
import { createDirector } from './director.js';
import { drawFrame } from './frame.js';
import { HOME, SCENE } from './layout.js';
import { costumeOf, defaultLooks } from './looks.js';
import { createPainter } from './painter.js';

const dress = (looks) => Object.fromEntries(PARTICIPANT_IDS.map((id) => [id, costumeOf(id, looks[id])]));

const MAX_FRAME_SECONDS = 0.1; // un onglet resté en arrière-plan ne fait pas bondir les personnages

/**
 * Anime le bureau dans `canvas` et pose les noms et les bulles dans `overlay`.
 * Renvoie de quoi le piloter depuis la conversation.
 */
export function createOffice(canvas, overlay) {
  const painter = createPainter(canvas.getContext('2d'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pick = () => {};
  let pickUser = () => {};
  let target = BOTH;
  let costumes = dress(defaultLooks());

  // Un agent cliqué devient le destinataire ; la personne cliquée, c'est soi.
  const choose = (id) => (isAgent(id) ? pick(id) : pickUser(id));

  const director = createDirector({ instant: reducedMotion, random: Math.random });
  const { actors } = director;
  const bubbles = createBubbles(overlay, PARTICIPANT_IDS, { onPick: choose });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    director.advance(dt, now);
    drawFrame(painter, actors, costumes, now);
    for (const id of PARTICIPANT_IDS) bubbles.place(actors[id], target);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Clics sur la scène ----------

  /** Le personnage visé par un clic : un agent par son bureau entier ou par lui-même, la personne par elle-même. */
  function characterAt(event) {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * SCENE.width;
    const y = ((event.clientY - box.top) / box.height) * SCENE.height;
    for (const id of AGENT_IDS) {
      const { pos } = actors[id];
      const home = HOME[id];
      if (Math.abs(x - home.x) < 30 && y > home.y - 20 && y < home.y + 22) return id;
      if (Math.abs(x - pos.x) < 8 && y > pos.y - 18 && y < pos.y + 2) return id;
    }
    const { pos } = actors[USER];
    return Math.abs(x - pos.x) < 8 && y > pos.y - 18 && y < pos.y + 2 ? USER : null;
  }

  canvas.addEventListener('mousemove', (event) => {
    canvas.style.cursor = characterAt(event) ? 'pointer' : 'default';
  });
  canvas.addEventListener('click', (event) => {
    const id = characterAt(event);
    if (id) choose(id);
  });

  return {
    /** `fn` reçoit l'agent sur lequel on clique, dans la scène ou sur son étiquette. */
    onPick(fn) {
      pick = fn;
    },

    /** `fn` reçoit la personne quand elle clique sur son propre personnage, ou sur son étiquette. */
    onPickUser(fn) {
      pickUser = fn;
    },

    /** Habille les personnages : `looks` donne l'apparence de chacun (voir looks.js). */
    setLooks(looks) {
      costumes = dress(looks);
    },

    /** Met en valeur le ou les destinataires du prochain message. */
    setTarget(next) {
      target = next;
    },

    /** Un personnage va porter son message à son destinataire. */
    deliver(from, to, text, image) {
      director.deliver(from, to, bubbleText(text), image);
    },

    /** Dit si un agent travaille, et ce qu'il fait ; `activity` omis garde le texte en place. */
    setWorking(id, working, activity) {
      director.setWorking(id, working, activity);
    },

    /** Remet tout le monde à sa place (changement de salon). */
    reset() {
      director.reset();
    },
  };
}
