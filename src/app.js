// L'appli elle-même : assemble les pièces et démarre le serveur.
const config = require('./config');
const { agents } = require('./agents');
const { Conductor } = require('./conductor');
const { EventHub } = require('./events');
const { createHttpServer } = require('./http/server');
const { Settings } = require('./settings');
const { RoomStore } = require('./store');
const { RESTART_EXIT_CODE } = require('./supervisor');
const { Updater } = require('./updater');

function start() {
  const store = new RoomStore(config);
  store.load();
  const hub = new EventHub();
  const settings = new Settings(config);
  const conductor = new Conductor({ store, hub, agents });

  // À la fermeture, on arrête aussi les IA en cours : sans cela leurs outils continueraient seuls.
  const shutdown = (code = 0) => {
    conductor.stopAll();
    process.exit(code);
  };

  const updater = new Updater({
    rootDir: config.ROOT_DIR,
    hub,
    settings,
    isBusy: () => conductor.isBusy(),
    restart: () => shutdown(RESTART_EXIT_CODE),
    checkEveryMinutes: config.UPDATE_CHECK_MINUTES,
  });

  const server = createHttpServer({ config, store, hub, conductor, agents, settings, updater });
  server.listen(config.PORT, config.HOST, () => {
    console.log(`Tandem is running at http://localhost:${config.PORT}`);
    for (const agent of agents.values()) console.log(`${agent.product.padEnd(12)}: ${agent.binary || 'not found'}`);
    updater.start();
  });

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
}

module.exports = { start };
