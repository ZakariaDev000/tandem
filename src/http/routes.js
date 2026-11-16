// Les routes de l'API : chacune traduit une demande de la page en un appel aux services.
const { PROMPT_PATH } = require('../approvals');
const { AppError } = require('../errors');
const { pickFolder } = require('../folderPicker');
const { toPublic } = require('../store');
const { serveMcp } = require('./mcp');
const { readJson, sendJson } = require('./respond');
const { serveMedia } = require('./static');

/**
 * Renvoie la table des routes. Dans un chemin, « :nom » capture un segment.
 * Un gestionnaire reçoit { req, res, params } et, pour les routes d'un salon, `room`.
 */
function createRoutes({ store, hub, conductor, agents, settings, updater, approvals }) {
  /** Enveloppe une route de salon : résout le salon, ou répond qu'il n'existe plus. */
  const withRoom = (handler) => (context) => {
    const room = store.get(context.params.roomId);
    if (!room) throw new AppError(404, 'room_not_found', 'Room not found.');
    return handler({ ...context, room });
  };
  const ok = (res) => sendJson(res, 200, { ok: true });
  /** Le guichet d'un tour : le serveur MCP où une IA dépose ses demandes d'autorisation. */
  const permissionPrompt = ({ req, res, params }) => {
    const tool = approvals.toolOf(params.token);
    if (!tool) throw new AppError(404, 'not_found', 'Not found.');
    return serveMcp(req, res, { name: 'tandem', tools: [tool] });
  };
  // Change à chaque démarrage : une page restée ouverte sait ainsi que le serveur a été relancé.
  const startedAt = Date.now();

  return [
    ['GET', '/api/events', ({ req, res }) => {
      const installed = Object.fromEntries([...agents.values()].map((agent) => [agent.id, !!agent.binary]));
      hub.subscribe(req, res, { rooms: store.all().map(toPublic), agents: installed, settings: settings.all(), update: updater.state, startedAt });
    }],

    ['GET', '/api/media/:roomId/:file', ({ res, params }) => serveMedia(res, store.mediaDirOf(params.roomId), params.file)],

    ['POST', '/api/settings', async ({ req, res }) => {
      const saved = settings.update(await readJson(req));
      hub.broadcast('settings', saved);
      // Passer en automatique installe tout de suite une mise à jour qui attendait.
      if (saved.autoUpdate) updater.apply();
      sendJson(res, 200, saved);
    }],

    ['POST', '/api/update/check', async ({ res }) => sendJson(res, 200, await updater.check())],

    ['POST', '/api/update/apply', async ({ res }) => sendJson(res, 200, await updater.apply())],

    ['POST', '/api/pick-folder', async ({ req, res }) => {
      const { prompt } = await readJson(req);
      sendJson(res, 200, { path: await pickFolder(prompt) });
    }],

    ['POST', '/api/rooms', async ({ req, res }) => {
      const room = store.create(await readJson(req));
      hub.broadcast('room-created', toPublic(room));
      sendJson(res, 200, toPublic(room));
    }],

    ['POST', '/api/rooms/:roomId/messages', withRoom(async ({ req, res, room }) => {
      const { to, text, parallel } = await readJson(req);
      const trimmed = String(text || '').trim();
      if (!trimmed) throw new AppError(400, 'empty_message', 'The message is empty.');
      conductor.post(room, { to, text: trimmed, parallel });
      ok(res);
    })],

    ['POST', '/api/rooms/:roomId/pause', withRoom(async ({ req, res, room }) => {
      const { paused } = await readJson(req);
      conductor.setPaused(room, paused);
      ok(res);
    })],

    ['POST', '/api/rooms/:roomId/stop', withRoom(({ res, room }) => {
      conductor.stop(room);
      ok(res);
    })],

    ['DELETE', '/api/rooms/:roomId', withRoom(({ res, room }) => {
      conductor.abandon(room);
      store.delete(room);
      hub.broadcast('room-deleted', { id: room.id });
      ok(res);
    })],

    ['POST', '/api/rooms/:roomId/approvals/:requestId', withRoom(async ({ req, res, params, room }) => {
      const { decision } = await readJson(req);
      conductor.answer(room, params.requestId, decision);
      ok(res);
    })],

    ['DELETE', '/api/rooms/:roomId/allowed/:ruleId', withRoom(({ res, params, room }) => {
      approvals.revoke(room, params.ruleId);
      ok(res);
    })],

    ['GET', `${PROMPT_PATH}/:token`, permissionPrompt],
    ['POST', `${PROMPT_PATH}/:token`, permissionPrompt],
  ];
}

module.exports = { createRoutes };
