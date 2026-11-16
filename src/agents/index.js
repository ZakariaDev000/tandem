// Les IA du salon. Pour en brancher une autre : écrire son adaptateur et l'ajouter à cette liste.
const { findExecutable } = require('../util');

const adapters = [require('./claude'), require('./codex')];

/** Identifiant -> adaptateur, complété du chemin de l'outil sur cette machine (null s'il est absent). */
const agents = new Map(adapters.map((adapter) => [adapter.id, { ...adapter, binary: findExecutable(adapter.command) }]));

module.exports = { agents };
