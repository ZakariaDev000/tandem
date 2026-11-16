// Le bureau de Tandem : une petite scène en pixels dessinée à la main dans un canvas.
// Trois personnages : Claude et ChatGPT à leur bureau, la personne sur le tapis.
// Ici, seulement la boucle d'animation et de quoi piloter la scène ; director.js décide
// des déplacements, frame.js dessine.
import { AGENT_IDS, BOTH, PARTICIPANT_IDS } from '../participants.js';
import { bubbleText, createBubbles } from './bubbles.js';
import { createDirector } from './director.js';
import { drawFrame } from './frame.js';
import { HOME, SCENE } from './layout.js';
import { createPainter } from './painter.js';

const MAX_FRAME_SECONDS = 0.1; // un onglet resté en arrière-plan ne fait pas bondir les personnages

/**
 * Anime le bureau dans `canvas` et pose les noms et les bulles dans `overlay`.
 * Renvoie de quoi le piloter depuis la conversation.
 */
export function createOffice(canvas, overlay) {
  const painter = createPainter(canvas.getContext('2d'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pick = () => {};
  let target = BOTH;

  const director = createDirector({ instant: reducedMotion, random: Math.random });
  const { actors } = director;
  const bubbles = createBubbles(overlay, PARTICIPANT_IDS, { onPick: (id) => pick(id) });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
    last = now;
    director.advance(dt, now);
    drawFrame(painter, actors, now);
    for (const id of PARTICIPANT_IDS) bubbles.place(actors[id], target);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Clics sur la scène ----------

  /** L'agent visé par un clic : son bureau entier, ou lui-même quand il n'y est pas. */
  function agentAt(event) {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * SCENE.width;
    const y = ((event.clientY - box.top) / box.height) * SCENE.height;
    for (const id of AGENT_IDS) {
      const { pos } = actors[id];
      const home = HOME[id];
      if (Math.abs(x - home.x) < 30 && y > home.y - 20 && y < home.y + 22) return id;
      if (Math.abs(x - pos.x) < 8 && y > pos.y - 18 && y < pos.y + 2) return id;
    }
    return null;
  }

  canvas.addEventListener('mousemove', (event) => {
    canvas.style.cursor = agentAt(event) ? 'pointer' : 'default';
  });
  canvas.addEventListener('click', (event) => {
    const id = agentAt(event);
    if (id) pick(id);
  });

  return {
    /** `fn` reçoit l'agent sur lequel on clique, dans la scène ou sur son étiquette. */
    onPick(fn) {
      pick = fn;
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
