// Les trois gestes de dessin de la scène : un rectangle plein, un personnage en pixels,
// et un passage en transparence.
import { SPRITE_WIDTH } from './sprites.js';

export function createPainter(ctx) {
  // Les pixels doivent rester nets quand le navigateur agrandit le canvas.
  ctx.imageSmoothingEnabled = false;

  return {
    rect(x, y, width, height, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), width, height);
    },

    /** Dessine des lignes de pixels (voir sprites.js) avec la palette donnée. */
    sprite(rows, palette, x, y) {
      for (let j = 0; j < rows.length; j++) {
        const row = rows[j];
        for (let i = 0; i < SPRITE_WIDTH; i++) {
          const pixel = row[i];
          if (pixel === '.') continue;
          ctx.fillStyle = palette[pixel];
          ctx.fillRect(x + i, y + j, 1, 1);
        }
      }
    },

    /** Dessine en transparence, le temps de `draw`. */
    faded(alpha, draw) {
      ctx.globalAlpha = alpha;
      draw();
      ctx.globalAlpha = 1;
    },
  };
}
