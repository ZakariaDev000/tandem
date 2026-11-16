// Le dessin d'un personnage selon son état : assis, en train de taper, debout ou en marche,
// et ses petites pauses (il s'étire, regarde par la fenêtre, rapporte un café).
// Son apparence arrive en `costume` (voir looks.js) : palette, tête de face et de dos.
import { isSeated, isWalking } from './actors.js';
import { ARMS_UP, BODY, BODY_ARMS_UP, BODY_TYPING, LEGS, SPRITE_WIDTH, WALK_CYCLE } from './sprites.js';

const CUP = '#f6efe2';

function drawSeated(p, actor, costume, x, now) {
  const { palette, head } = costume;
  // Le bureau ou la table cache les jambes : on ne dessine que le buste.
  const y = Math.round(actor.pos.y) - 15;
  if (actor.pose === 'stretch') {
    p.sprite(head.concat(BODY_ARMS_UP), palette, x, y);
    p.sprite(ARMS_UP, palette, x, y);
    return;
  }
  const typing = actor.working && Math.floor(now / 180) % 2;
  p.sprite(head.concat(typing ? BODY_TYPING : BODY), palette, x, y);
}

function legsOf(actor, now) {
  if (isWalking(actor)) return WALK_CYCLE[Math.floor(actor.step / 5) % WALK_CYCLE.length];
  // Il bat du pied : un pied se lève, par à-coups.
  if (actor.pose === 'tap') return Math.floor(now / 220) % 2;
  return 0;
}

/** Un personnage debout, son ombre à ses pieds, le coin haut gauche en (`x`, `y`). Sert aussi à l'aperçu. */
export function drawFigure(p, costume, x, y, { legs = 0, fromBehind = false } = {}) {
  p.faded(0.18, () => p.rect(x + 2, y + 15, 8, 2, '#000000'));
  p.sprite((fromBehind ? costume.back : costume.head).concat(BODY, LEGS[legs]), costume.palette, x, y);
}

export function drawCharacter(p, actor, costume, now) {
  const x = Math.round(actor.pos.x) - SPRITE_WIDTH / 2;
  if (isSeated(actor)) return drawSeated(p, actor, costume, x, now);
  const y = Math.round(actor.pos.y) - 16;
  drawFigure(p, costume, x, y, { legs: legsOf(actor, now), fromBehind: actor.pose === 'back' });
  if (actor.holding === 'cup') {
    // La tasse dans la main, et sa vapeur qui danse.
    p.rect(x + 10, y + 8, 2, 2, CUP);
    p.rect(x + 10 + (Math.floor(now / 400) % 2), y + 6, 1, 1, '#ffffff');
  }
}
