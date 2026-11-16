#!/usr/bin/env node
// Tandem — un salon local où une session Claude Code et une session Codex (ChatGPT) se parlent.
//
// Ce fichier se lance deux fois : d'abord comme superviseur, qui démarre l'appli dans un second
// processus et la relance après une mise à jour ; puis comme appli. Tout le reste vit dans src/.
const { supervise, isWorker } = require('./src/supervisor');

if (isWorker()) require('./src/app').start();
else supervise(__filename);
