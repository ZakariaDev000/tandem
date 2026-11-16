// La fenêtre « Personnages » : coiffure et couleurs de chacun, avec un aperçu dessiné comme
// dans le bureau. Chaque choix s'applique tout de suite et reste en mémoire dans le navigateur.
import { t } from './i18n/index.js';
import { byId } from './dom.js';
import { displayName } from './format.js';
import { PARTICIPANT_IDS, USER } from './participants.js';
import { drawFigure } from './office/characters.js';
import { choicesFor, costumeOf, DEFAULT_LOOKS, HAIR_COLORS, loadLooks, normalizeLook, OUTFITS, saveLooks, SKIN_TONES } from './office/looks.js';
import { createPainter } from './office/painter.js';
import { FLOOR, WALL } from './office/scene.js';

// Les couleurs proposées pour chaque réglage à nuancier.
const SWATCHES = {
  hairColor: (key) => HAIR_COLORS[key],
  skin: (key) => SKIN_TONES[key],
  outfit: (key) => OUTFITS[key].c,
};

// L'aperçu : un bout de mur et de parquet, le personnage debout au milieu.
const PREVIEW = { horizon: 12, x: 4, y: 5 };

// Le stockage du navigateur peut être refusé jusque dans son accès : on s'en passe alors.
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function swatchField(key, choices, onPick) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'swatches';
  const legend = document.createElement('legend');
  legend.textContent = t('looks.' + key);
  fieldset.append(legend);
  choices.forEach((choice, i) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'look-' + key;
    input.value = choice;
    input.setAttribute('aria-label', t('looks.choice', { n: i + 1, total: choices.length }));
    input.addEventListener('change', () => onPick(key, choice));
    const chip = document.createElement('span');
    chip.style.background = SWATCHES[key](choice);
    label.append(input, chip);
    fieldset.append(label);
  });
  return fieldset;
}

function styleField(choices, onPick) {
  const label = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = t('looks.hair');
  const select = document.createElement('select');
  select.name = 'look-hair';
  for (const choice of choices) select.append(new Option(t('looks.style.' + choice), choice));
  select.addEventListener('change', () => onPick('hair', select.value));
  label.append(name, select);
  return label;
}

/** Branche la fenêtre. `onChange` reçoit l'apparence de tous, au départ puis à chaque choix. */
export function createLooksDialog({ onChange }) {
  const dialog = byId('looks-dialog');
  const who = byId('looks-who');
  const fields = byId('looks-fields');
  const preview = byId('looks-preview');
  const painter = createPainter(preview.getContext('2d'));
  const storage = browserStorage();
  let looks = loadLooks(storage);
  let current = USER;

  const tabs = PARTICIPANT_IDS.map((id) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'radio');
    tab.className = id;
    tab.textContent = displayName(id);
    tab.addEventListener('click', () => show(id));
    who.append(tab);
    return tab;
  });

  function update(key, value) {
    looks = { ...looks, [current]: normalizeLook(current, { ...looks[current], [key]: value }) };
    saveLooks(storage, looks);
    onChange(looks);
    render();
  }

  /** Les réglages de `id` : la tenue des agents exclut la couleur de l'autre, d'où un formulaire chacun. */
  function buildFields(id) {
    const choices = choicesFor(id);
    fields.replaceChildren(styleField(choices.hair, update), ...Object.keys(SWATCHES).map((key) => swatchField(key, choices[key], update)));
  }

  function drawPreview() {
    const { width, height } = preview;
    painter.rect(0, 0, width, PREVIEW.horizon, WALL);
    painter.rect(0, PREVIEW.horizon, width, height - PREVIEW.horizon, FLOOR);
    drawFigure(painter, costumeOf(current, looks[current]), PREVIEW.x, PREVIEW.y);
  }

  function render() {
    tabs.forEach((tab, i) => tab.setAttribute('aria-checked', String(PARTICIPANT_IDS[i] === current)));
    const look = looks[current];
    fields.querySelector('select').value = look.hair;
    for (const input of fields.querySelectorAll('input[type="radio"]')) input.checked = look[input.name.slice('look-'.length)] === input.value;
    drawPreview();
  }

  function show(id) {
    current = id;
    buildFields(id);
    render();
  }

  byId('looks-reset').addEventListener('click', () => {
    looks = { ...looks, [current]: { ...DEFAULT_LOOKS[current] } };
    saveLooks(storage, looks);
    onChange(looks);
    render();
  });
  byId('open-looks').addEventListener('click', () => open(current));

  /** Ouvre la fenêtre sur le personnage `id`. */
  function open(id) {
    show(id);
    dialog.showModal();
  }

  onChange(looks);
  return { open };
}
