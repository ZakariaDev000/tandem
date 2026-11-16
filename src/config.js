// Réglages et emplacements. Tout le reste du serveur les reçoit d'ici, sans rien deviner.
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = process.env.TANDEM_DATA || path.join(ROOT_DIR, 'data');

module.exports = {
  // L'appli pilote des outils qui écrivent sur le disque : elle n'écoute que sur cette machine.
  HOST: '127.0.0.1',
  PORT: Number(process.env.PORT) || 3210,
  ROOT_DIR,
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  DATA_DIR,
  ROOMS_DIR: path.join(DATA_DIR, 'rooms'),
  WORKSPACES_DIR: path.join(DATA_DIR, 'workspaces'),
  MEDIA_DIR: path.join(DATA_DIR, 'media'),
  ATTACHMENTS_DIR: path.join(DATA_DIR, 'attachments'),
  // Intervalle entre deux vérifications de mise à jour.
  UPDATE_CHECK_MINUTES: Number(process.env.TANDEM_UPDATE_MINUTES) || 30,
};
