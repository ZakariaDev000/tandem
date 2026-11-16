// Le thème de la page : celui du système, ou celui choisi dans les réglages.
// Le navigateur se souvient du choix ; theme-boot.js l'applique dès le chargement.
import { readPref, writePref } from './prefs.js';

const PREF = 'theme';
const SYSTEM = 'system';
const CHOICES = [SYSTEM, 'light', 'dark'];

/** Branche le choix du thème de la fenêtre des réglages, et suit le système tant qu'on le lui laisse. */
export function initTheme() {
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const saved = readPref(PREF);
  let choice = CHOICES.includes(saved) ? saved : SYSTEM;

  function apply() {
    const dark = choice === 'dark' || (choice === SYSTEM && systemDark.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  systemDark.addEventListener('change', apply);
  for (const radio of document.querySelectorAll('input[name="theme"]')) {
    radio.checked = radio.value === choice;
    radio.addEventListener('change', () => {
      choice = radio.value;
      writePref(PREF, choice);
      apply();
    });
  }
  apply();
}
