const { execFile } = require('node:child_process');

/**
 * Ouvre la fenêtre de choix de dossier du système et renvoie le chemin choisi, ou null.
 * Seul macOS est pris en charge : ailleurs, la personne saisit le chemin à la main.
 */
function pickFolder(prompt) {
  if (process.platform !== 'darwin') return Promise.resolve(null);
  // Le titre est placé dans une commande AppleScript : on n'y garde que des caractères sans danger.
  const safe = String(prompt || '').replace(/[^\p{L}\p{N} ,.’-]/gu, '').slice(0, 80) || 'Working folder';
  return new Promise((resolve) => {
    execFile('osascript', ['-e', `POSIX path of (choose folder with prompt "${safe}")`], { timeout: 120000 }, (err, stdout) =>
      resolve(err ? null : stdout.trim().replace(/\/$/, ''))
    );
  });
}

module.exports = { pickFolder };
