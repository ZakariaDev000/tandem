const { execFile } = require('node:child_process');

/** Lance une commande git dans un dossier et renvoie sa sortie, sans jamais attendre une saisie. */
function git(args, cwd) {
  return new Promise((resolve, reject) => {
    // GIT_TERMINAL_PROMPT=0 : si le dépôt demande un mot de passe, git échoue au lieu de rester bloqué.
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    execFile('git', args, { cwd, env, timeout: 60000 }, (error, stdout) => (error ? reject(error) : resolve(stdout.trim())));
  });
}

module.exports = { git };
