// Le superviseur garde la main sur le terminal et relance l'appli quand elle le demande,
// par exemple après une mise à jour : un programme ne peut pas se remplacer lui-même en cours de route.
const { fork } = require('node:child_process');

// Code de sortie par lequel l'appli demande à être relancée.
const RESTART_EXIT_CODE = 75;
const WORKER_FLAG = 'TANDEM_WORKER';

const isWorker = () => process.env[WORKER_FLAG] === '1';

function supervise(entryFile) {
  let child;
  const launch = () => {
    child = fork(entryFile, process.argv.slice(2), { env: { ...process.env, [WORKER_FLAG]: '1' } });
    child.on('exit', (code, signal) => {
      if (code === RESTART_EXIT_CODE) return launch();
      process.exit(code ?? (signal ? 1 : 0));
    });
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child && child.kill(signal));
  launch();
}

module.exports = { supervise, isWorker, RESTART_EXIT_CODE };
