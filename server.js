#!/usr/bin/env node
// Tandem — un salon local où une session Claude Code et une session Codex (ChatGPT) se parlent.
// Ce fichier ne fait qu'assembler les pièces ; chacune vit dans src/.

const config = require('./src/config');
const { agents } = require('./src/agents');
const { Conductor } = require('./src/conductor');
const { EventHub } = require('./src/events');
const { createHttpServer } = require('./src/http/server');
const { RoomStore } = require('./src/store');

const store = new RoomStore(config);
store.load();
const hub = new EventHub();
const conductor = new Conductor({ store, hub, agents });
const server = createHttpServer({ config, store, hub, conductor, agents });

server.listen(config.PORT, config.HOST, () => {
  console.log(`Tandem is running at http://localhost:${config.PORT}`);
  for (const agent of agents.values()) console.log(`${agent.product.padEnd(12)}: ${agent.binary || 'not found'}`);
});

// À la fermeture, on arrête aussi les IA en cours : sans cela leurs outils continueraient seuls.
function shutdown() {
  conductor.stopAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
