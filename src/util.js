const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Ramène un texte sur une ligne et le coupe proprement. */
function shorten(text, max = 70) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

const baseName = (file) => (file ? path.basename(String(file)) : '');

function expandHome(input) {
  const value = String(input || '').trim();
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

/**
 * Cherche un outil dans le PATH, puis aux endroits où il s'installe d'habitude :
 * lancée depuis une appli graphique, la page n'hérite pas toujours du PATH du terminal.
 */
function findExecutable(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).concat([
    path.join(os.homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

module.exports = { shorten, baseName, expandHome, findExecutable };
