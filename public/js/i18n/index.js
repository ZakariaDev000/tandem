// Textes de l'interface. La langue suit celle du navigateur ; l'anglais sert de repli.
// Pour ajouter une langue : copier en.js, le traduire, puis l'inscrire ci-dessous.
// On peut forcer une langue avec ?lang=fr dans l'adresse.
import en from './en.js';
import fr from './fr.js';

const FALLBACK = 'en';
const dictionaries = { en, fr };
const supported = Object.keys(dictionaries);

function pickLanguage() {
  const forced = new URLSearchParams(location.search).get('lang');
  const wanted = [forced].concat(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
  for (const code of wanted) {
    const short = String(code || '').toLowerCase().split('-')[0];
    if (supported.includes(short)) return short;
  }
  return FALLBACK;
}

export const lang = pickLanguage();

/** Renvoie le texte d'une clé, en remplaçant les {variables}. */
export function t(key, vars) {
  let text = dictionaries[lang][key];
  if (text === undefined) text = dictionaries[FALLBACK][key];
  if (text === undefined) return key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined ? '' : String(vars[name]))) : text;
}

/** Remplit les textes fixes de la page : data-i18n, et data-i18n-<attribut>. */
export function apply(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
  }
  document.documentElement.lang = lang;
}
