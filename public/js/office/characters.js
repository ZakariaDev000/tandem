// Le dessin d'un personnage selon son état : assis, en train de taper, debout ou en marche.
import { isSeated, isWalking } from './actors.js';
import { BODY, BODY_TYPING, HEADS, LEGS, PALETTES, SPRITE_WIDTH, WALK_CYCLE } from './sprites.js';

export function drawCharacter(p, actor, now) {
  const palette = PALETTES[actor.id];
  const head = HEADS[actor.id];
  const x = Math.round(actor.pos.x) - SPRITE_WIDTH / 2;
  if (isSeated(actor)) {
    // Le bureau ou la table cache les jambes : on ne dessine que le buste.
    const typing = actor.working && Math.floor(now / 180) % 2;
    p.sprite(head.concat(typing ? BODY_TYPING : BODY), palette, x, Math.round(actor.pos.y) - 15);
    return;
  }
  const frame = isWalking(actor) ? WALK_CYCLE[Math.floor(actor.step / 5) % WALK_CYCLE.length] : 0;
  const y = Math.round(actor.pos.y) - 16;
  // Ombre
  p.faded(0.18, () => p.rect(x + 2, y + 15, 8, 2, '#000000'));
  p.sprite(head.concat(BODY, LEGS[frame]), palette, x, y);
}
