// Les personnages, dessinés à la main : une lettre par pixel, 12 pixels de large.
// « . » est transparent ; les autres lettres renvoient à la palette du personnage :
// h cheveux, s peau, e yeux, c vêtement, d vêtement foncé, p pantalon, b chaussures.
export const SPRITE_WIDTH = 12;

export const PALETTES = {
  claude: { h: '#7a3b1e', s: '#f1c9a5', e: '#2b2420', c: '#d9643a', d: '#b44d28', p: '#4a3b34', b: '#2b2420' },
  chatgpt: { h: '#1d2b2a', s: '#e3b58f', e: '#2b2420', c: '#1f8f7d', d: '#16705f', p: '#3a4652', b: '#2b2420' },
  user: { h: '#2b2420', s: '#c98f63', e: '#2b2420', c: '#2f4a7a', d: '#233a61', p: '#55606e', b: '#2b2420' },
};

// Les coiffures, au choix de chacun (voir looks.js). Les trois premières sont celles d'origine
// de Claude, de ChatGPT (avec son casque, aux couleurs de sa tenue) et de la personne (sa casquette).
export const HAIR_STYLES = {
  crop: ['....hhhh....', '...hhhhhh...', '..hhsssshh..', '...sesses...', '...ssssss...', '....ssss....'],
  headset: ['...hhhhhh...', '..hhhhhhhh..', '..dssssssd..', '..dsessesd..', '...ssssss...', '....ssss....'],
  cap: ['...cccccc...', '..cccccccc..', '..dddddddd..', '...sesses...', '...ssssss...', '....ssss....'],
  long: ['...hhhhhh...', '..hhhhhhhh..', '..hssssssh..', '..hsessesh..', '..hssssssh..', '..h.ssss.h..'],
  bun: ['.....hh.....', '...hhhhhh...', '..hhsssshh..', '...sesses...', '...ssssss...', '....ssss....'],
  curly: ['..hh.hh.hh..', '..hhhhhhhh..', '..hhsssshh..', '..hsessesh..', '...ssssss...', '....ssss....'],
};

export const BODY = ['..cccccccc..', '.dccccccccd.', '.dccccccccd.', '.sccccccccs.', '..cccccccc..'];

// Les mains remontent d'un pixel : alterné avec BODY, le personnage tape au clavier.
export const BODY_TYPING = ['..cccccccc..', '.dccccccccd.', '.sccccccccs.', '..cccccccc..', '..cccccccc..'];

// Il s'étire : le buste sans les bras, et les bras levés, à poser par-dessus à partir du haut
// de la tête. Les têtes n'occupent jamais les colonnes des bras (la 2e et l'avant-dernière).
export const BODY_ARMS_UP = ['..cccccccc..', '.dccccccccd.', '..cccccccc..', '..cccccccc..', '..cccccccc..'];
export const ARMS_UP = ['............', '.s........s.', '.d........d.', '.d........d.', '.d........d.', '.d........d.', '.d........d.'];

/** La même tête vue de dos : les cheveux recouvrent le visage, la nuque reste. */
export const backOf = (head) => head.map((row, i) => (i === head.length - 1 ? row : row.replace(/[se]/g, 'h')));

// Debout, puis un pied levé, puis l'autre.
export const LEGS = [
  ['...pppppp...', '...pp..pp...', '...pp..pp...', '...pp..pp...', '...bb..bb...'],
  ['...pppppp...', '...pp..pp...', '...pp..pp...', '...pp..bb...', '...bb.......'],
  ['...pppppp...', '...pp..pp...', '...pp..pp...', '...bb..pp...', '.......bb...'],
];

// L'ordre des images de LEGS pendant la marche.
export const WALK_CYCLE = [0, 1, 0, 2];
