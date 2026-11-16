const { execFile } = require('node:child_process');

/**
 * Lance une commande git dans un dossier et renvoie sa sortie, sans jamais attendre une saisie.
 * `input` est écrit sur l'entrée de la commande. `raw` garde la sortie telle quelle : dans un
 * correctif, une ligne faite d'un seul espace compte. Le reste (env, timeout, maxBuffer)
 * complète les réglages par défaut.
 */
function git(args, cwd, { env, input, raw, ...limits } = {}) {
  return new Promise((resolve, reject) => {
    // GIT_TERMINAL_PROMPT=0 : si le dépôt demande un mot de passe, git échoue au lieu de rester bloqué.
    const options = { cwd, timeout: 60000, ...limits, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env } };
    const child = execFile('git', args, options, (error, stdout) => (error ? reject(error) : resolve(raw ? stdout : stdout.trim())));
    if (input === undefined || !child.stdin) return;
    // Si git s'arrête avant d'avoir tout lu, l'échec est déjà signalé par la commande elle-même.
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

module.exports = { git };
