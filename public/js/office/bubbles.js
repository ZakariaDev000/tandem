// Ce qui s'affiche par-dessus le canvas, en vrai texte : l'étiquette du nom de chaque
// personnage et sa bulle (ce qu'il dit, ou ce qu'il est en train de faire).
import { t } from '../i18n/index.js';
import { displayName } from '../format.js';
import { BOTH, isAgent } from '../participants.js';
import { isAtWork, isSeated, isSpeaking, tableSide } from './actors.js';
import { SCENE } from './layout.js';

const MAX_LENGTH = 150;

/** Le texte d'une bulle : sans mise en forme, sur une ligne, et court. */
export function bubbleText(text) {
  const plain = String(text || '').replace(/```[\s\S]*?```/g, '[code]').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > MAX_LENGTH ? plain.slice(0, MAX_LENGTH - 1) + '…' : plain;
}

const percent = (value, total) => ((value / total) * 100).toFixed(2) + '%';

/** Crée l'étiquette et la bulle de chaque personnage. `onPick` reçoit celui dont on clique l'étiquette. */
export function createBubbles(overlay, ids, { onPick }) {
  const elements = {};
  for (const id of ids) {
    const tag = document.createElement('div');
    tag.className = 'tag ' + id;
    tag.textContent = displayName(id);
    tag.addEventListener('click', () => onPick(id));
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    overlay.append(bubble, tag);
    elements[id] = { tag, bubble, shown: '' };
  }

  /** Place l'étiquette et la bulle d'un personnage au-dessus de sa tête, et met la bulle à jour. */
  function place(actor, target) {
    const el = elements[actor.id];
    const headY = actor.pos.y - (isSeated(actor) ? 16 : 17);
    const left = percent(actor.pos.x, SCENE.width);
    const top = percent(headY, SCENE.height);
    el.tag.style.left = left;
    el.tag.style.top = top;
    // La bulle ne sort pas du cadre, même près d'un bord.
    el.bubble.style.left = `clamp(70px, ${left}, calc(100% - 70px))`;
    el.bubble.style.top = `calc(${top} - 26px)`;

    let text = '';
    let work = false;
    if (isSpeaking(actor) && actor.say) text = actor.say;
    else if (isAtWork(actor)) {
      text = actor.activity || t('office.thinking');
      work = true;
    }
    // À la table, le nom et l'action de chacun s'écartent de son voisin.
    const side = tableSide(actor);
    // On ne touche à la bulle que si son contenu change : cette fonction tourne à chaque image.
    const key = (work ? 'w:' + side + ':' : 's:' + actor.lean + ':' + actor.sayImage + ':') + text;
    if (key !== el.shown) {
      el.shown = key;
      if (text) {
        el.bubble.textContent = text;
        if (!work && actor.sayImage) {
          const img = document.createElement('img');
          img.src = actor.sayImage;
          img.alt = '';
          el.bubble.prepend(img);
        }
      }
      el.bubble.classList.toggle('work', work);
      el.bubble.classList.toggle('lean-right', !work && actor.lean === 'right');
      el.bubble.classList.toggle('lean-left', !work && actor.lean === 'left');
      el.bubble.classList.toggle('side-left', work && side === 'left');
      el.bubble.classList.toggle('side-right', work && side === 'right');
      el.bubble.classList.toggle('show', !!text);
    }
    el.tag.classList.toggle('side-left', side === 'left');
    el.tag.classList.toggle('side-right', side === 'right');
    el.tag.classList.toggle('target', isAgent(actor.id) && (target === actor.id || target === BOTH));
  }

  return { place };
}
