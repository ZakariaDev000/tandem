// Le décor du bureau : la pièce, puis les bureaux et les chaises des agents.
import { HOME, SCENE } from './layout.js';
import { PALETTES } from './sprites.js';

const { width: W, height: H } = SCENE;

const WOOD = '#6b4a2e';
const NIGHT = '#27304f';
const BOOKS = ['#d9643a', '#2f4a7a', '#e7a13a', '#1f8f7d', '#7d5a8c', '#b3372b', '#55606e'];
const STARS = [[110, 13], [121, 22], [131, 11], [116, 30], [145, 27]];

function skyColor(hour) {
  if (hour >= 7 && hour < 17) return '#9fd3f2';
  if (hour >= 17 && hour < 20) return '#f2b98a';
  return NIGHT;
}

function drawRoom(p) {
  // Mur
  p.rect(0, 0, W, 54, '#efe2c8');
  p.rect(0, 42, W, 10, '#e4d3b2');
  p.rect(0, 41, W, 1, '#d2bf9b');
  p.rect(0, 52, W, 2, '#8a6a4a');
  // Parquet
  p.rect(0, 54, W, H - 54, '#c9a06b');
  for (let y = 54, n = 0; y < H; y += 9, n++) {
    p.rect(0, y, W, 1, '#b58c58');
    for (let x = (n % 2) * 20 - 6; x < W; x += 40) p.rect(x, y + 1, 1, 8, '#b58c58');
  }
}

function drawWindow(p, now) {
  // Le ciel suit l'heure réelle
  const sky = skyColor(new Date().getHours());
  p.rect(102, 6, 52, 34, WOOD);
  p.rect(104, 8, 48, 30, sky);
  if (sky === NIGHT) {
    p.rect(140, 12, 4, 4, '#f4eecf');
    for (const [sx, sy] of STARS) {
      // Chaque étoile s'éteint à son tour
      if (Math.floor(now / 700 + sx) % 5) p.rect(sx, sy, 1, 1, '#f4eecf');
    }
  } else {
    const drift = (now / 900) % 60;
    p.rect(100 + drift, 13, 12, 3, '#ffffff');
    p.rect(103 + drift, 11, 6, 2, '#ffffff');
    p.rect(74 + drift, 25, 10, 3, '#ffffff');
    p.rect(100, 8, 4, 30, WOOD);
    p.rect(152, 8, 2, 30, WOOD);
    // Tache de lumière sur le parquet
    p.faded(0.16, () => {
      for (let i = 0; i < 26; i++) p.rect(100 - i * 0.6, 58 + i, 56, 1, '#fff6d8');
    });
  }
  p.rect(127, 8, 2, 30, WOOD);
  p.rect(104, 22, 48, 2, WOOD);
  p.rect(99, 40, 58, 2, '#8a6a4a');
}

function drawShelf(p) {
  p.rect(18, 26, 46, 2, '#8a6a4a');
  let x = 21;
  BOOKS.forEach((color, i) => {
    const height = 8 + ((i * 3) % 4);
    p.rect(x, 26 - height, 4, height, color);
    p.rect(x, 26 - height + 2, 4, 1, '#f6efe2');
    x += 5;
  });
  // Petit pot posé au bout de l'étagère
  p.rect(58, 21, 4, 5, '#b5653a');
  p.rect(57, 17, 6, 4, '#4f9a55');
}

function drawPoster(p) {
  p.rect(196, 9, 30, 26, '#2b2420');
  p.rect(198, 11, 26, 22, '#f6efe2');
  p.rect(203, 16, 9, 12, '#d9643a');
  p.rect(211, 16, 9, 12, '#1f8f7d');
}

function drawCoffeeCorner(p, now) {
  p.rect(234, 40, 18, 16, '#8a5c30');
  p.rect(234, 40, 18, 2, '#a8743f');
  p.rect(238, 31, 9, 9, '#3b3430');
  p.rect(240, 33, 5, 3, '#6b5d52');
  p.rect(241, 37, 3, 3, '#f6efe2');
  // Vapeur
  const puff = Math.floor(now / 400) % 3;
  p.rect(242, 34 - puff - 6, 1, 2, '#ffffff');
}

function drawPlant(p, x, y) {
  p.rect(x - 4, y + 4, 9, 8, '#b5653a');
  p.rect(x - 5, y + 3, 11, 2, '#c97a4c');
  p.rect(x - 1, y - 6, 3, 10, '#3d8046');
  p.rect(x - 6, y - 4, 5, 3, '#4f9a55');
  p.rect(x + 2, y - 8, 5, 3, '#4f9a55');
  p.rect(x - 4, y - 11, 4, 4, '#62b068');
  p.rect(x + 1, y - 2, 5, 3, '#62b068');
}

function drawRug(p) {
  p.rect(98, 116, 60, 22, '#5f7199');
  p.rect(100, 118, 56, 18, '#7d8fb3');
  p.rect(104, 122, 48, 10, '#8fa0c2');
}

/** Tout ce qui reste derrière les personnages. `now` anime le ciel et la vapeur du café. */
export function drawBackground(p, now) {
  drawRoom(p);
  drawWindow(p, now);
  drawShelf(p);
  drawPoster(p);
  drawCoffeeCorner(p, now);
  drawPlant(p, 10, 56);
  drawPlant(p, 244, 110);
  drawRug(p);
}

/** Le bureau d'un agent. Son écran s'allume et défile quand `lit` est vrai. */
export function drawDesk(p, id, lit, now) {
  const { x: sx, y: sy } = HOME[id];
  // Bureau de gauche ou de droite : l'écran est du côté du mur, la tasse du côté du centre.
  const left = sx < W / 2;
  const accent = PALETTES[id].c;
  // Plateau et façade
  p.rect(sx - 28, sy - 4, 56, 8, '#a8743f');
  p.rect(sx - 28, sy - 4, 56, 1, '#c08c55');
  p.rect(sx - 26, sy + 4, 52, 12, '#8a5c30');
  p.rect(sx - 26, sy + 4, 52, 1, '#75491f');
  p.rect(sx - 26, sy + 16, 3, 4, '#6f4824');
  p.rect(sx + 23, sy + 16, 3, 4, '#6f4824');
  p.rect(sx - 8, sy + 8, 16, 2, '#75491f');
  // Écran
  const mx = left ? sx - 23 : sx + 9;
  p.rect(mx + 5, sy - 6, 4, 2, '#3b3430');
  p.rect(mx, sy - 17, 14, 11, '#2b2420');
  p.rect(mx + 1, sy - 16, 12, 9, lit ? '#e8f6ff' : '#4b4640');
  if (lit) {
    const tick = Math.floor(now / 160);
    for (let i = 0; i < 4; i++) {
      const ly = (i * 2 + tick) % 8;
      const lw = 3 + ((i * 5 + tick) % 7);
      p.rect(mx + 2, sy - 15 + ly, lw, 1, i % 2 ? accent : '#6b5d52');
    }
  }
  // Tasse
  const cx = left ? sx + 16 : sx - 20;
  p.rect(cx, sy - 7, 4, 4, accent);
  p.rect(cx + 4, sy - 6, 1, 2, accent);
}

export function drawChair(p, id) {
  const { x: sx, y: sy } = HOME[id];
  p.rect(sx - 6, sy - 13, 12, 10, '#5a4a40');
  p.rect(sx - 5, sy - 12, 10, 8, '#6f5d51');
}
