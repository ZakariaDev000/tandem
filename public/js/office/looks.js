// L'apparence des personnages : les choix proposés, ceux de chacun par défaut, et leur mémoire
// dans le navigateur. Les couleurs ont été choisies pour rester lisibles sur le décor.
import { AGENT_IDS, PARTICIPANT_IDS } from '../participants.js';
import { backOf, HAIR_STYLES, PALETTES } from './sprites.js';

const STORAGE_KEY = 'tandem.looks';

export const HAIR_COLORS = {
  auburn: '#7a3b1e',
  black: '#1d2b2a',
  brown: '#2b2420',
  copper: '#a8402a',
  grey: '#9a9590',
  golden: '#d9b23a',
};

// Du plus clair au plus foncé. Le plus foncé s'arrête là où les yeux et les cheveux auburn
// se perdraient dans le visage.
export const SKIN_TONES = {
  tone1: '#f6dcc4',
  tone2: '#f1c9a5',
  tone3: '#e3b58f',
  tone4: '#c98f63',
  tone5: '#a8714c',
  tone6: '#785444',
};

// Une tenue : sa couleur, et sa version foncée pour les ombres et les manches.
export const OUTFITS = {
  coral: { c: '#d9643a', d: '#b44d28' },
  teal: { c: '#1f8f7d', d: '#16705f' },
  blue: { c: '#2f4a7a', d: '#233a61' },
  mustard: { c: '#e7a13a', d: '#c4812a' },
  plum: { c: '#7d5a8c', d: '#634570' },
  green: { c: '#4f9a55', d: '#3d8046' },
  slate: { c: '#55606e', d: '#3a4652' },
};

// La tenue qui fait reconnaître chaque agent. Un autre ne peut pas la porter, pour ne pas s'y tromper.
const SIGNATURE = { claude: 'coral', chatgpt: 'teal' };

export const DEFAULT_LOOKS = {
  claude: { hair: 'crop', hairColor: 'auburn', skin: 'tone2', outfit: 'coral' },
  chatgpt: { hair: 'headset', hairColor: 'black', skin: 'tone3', outfit: 'teal' },
  user: { hair: 'cap', hairColor: 'brown', skin: 'tone4', outfit: 'blue' },
};

/** Les choix proposés à `id`, par réglage, dans l'ordre d'affichage. */
export function choicesFor(id) {
  const taken = AGENT_IDS.filter((other) => other !== id).map((other) => SIGNATURE[other]);
  return {
    hair: Object.keys(HAIR_STYLES),
    hairColor: Object.keys(HAIR_COLORS),
    skin: Object.keys(SKIN_TONES),
    outfit: Object.keys(OUTFITS).filter((outfit) => !taken.includes(outfit)),
  };
}

/** Une apparence sûre pour `id` : tout réglage inconnu ou interdit reprend sa valeur par défaut. */
export function normalizeLook(id, look) {
  const choices = choicesFor(id);
  const source = look && typeof look === 'object' ? look : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_LOOKS[id]).map(([key, fallback]) => [key, choices[key].includes(source[key]) ? source[key] : fallback]),
  );
}

export const defaultLooks = () => normalizeLooks({});

export const normalizeLooks = (looks) =>
  Object.fromEntries(PARTICIPANT_IDS.map((id) => [id, normalizeLook(id, looks && looks[id])]));

/** De quoi dessiner `id` avec l'apparence `look` : sa palette, sa tête de face et de dos. */
export function costumeOf(id, look) {
  const { hair, hairColor, skin, outfit } = normalizeLook(id, look);
  const head = HAIR_STYLES[hair];
  return {
    palette: { ...PALETTES[id], h: HAIR_COLORS[hairColor], s: SKIN_TONES[skin], ...OUTFITS[outfit] },
    head,
    back: backOf(head),
  };
}

// Le stockage du navigateur peut être refusé (navigation privée, réglages) : on s'en passe alors.

/** Les apparences enregistrées dans `storage`, ou celles par défaut. */
export function loadLooks(storage) {
  try {
    return normalizeLooks(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return defaultLooks();
  }
}

export function saveLooks(storage, looks) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(looks));
  } catch {}
}
