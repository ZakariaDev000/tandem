// Ce dont le navigateur se souvient d'une visite à l'autre : salon affiché, volet replié…
// Le stockage peut être refusé (navigation privée, réglages) : on s'en passe alors.

const keyOf = (name) => 'tandem.' + name;

export function readPref(name) {
  try {
    return localStorage.getItem(keyOf(name));
  } catch {
    return null;
  }
}

export function writePref(name, value) {
  try {
    localStorage.setItem(keyOf(name), value);
  } catch {}
}
