// Les réglages de l'installation, gardés dans le dossier de données.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  // Les mises à jour s'installent seules, sauf si la personne le refuse ici.
  autoUpdate: true,
};

class Settings {
  #file;
  #values;

  constructor({ DATA_DIR }) {
    this.#file = path.join(DATA_DIR, 'settings.json');
    this.#values = { ...DEFAULTS };
    try {
      Object.assign(this.#values, this.#known(JSON.parse(fs.readFileSync(this.#file, 'utf8'))));
    } catch {}
  }

  get(key) {
    return this.#values[key];
  }

  all() {
    return { ...this.#values };
  }

  /** Applique les réglages reconnus et les enregistre. Le reste est ignoré. */
  update(changes) {
    Object.assign(this.#values, this.#known(changes));
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    fs.writeFileSync(this.#file, JSON.stringify(this.#values, null, 1));
    return this.all();
  }

  /** Ne garde que les réglages qui existent, avec le bon type. */
  #known(input) {
    const known = {};
    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      if (input && typeof input[key] === typeof fallback) known[key] = input[key];
    }
    return known;
  }
}

module.exports = { Settings };
