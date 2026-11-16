// Les routes de l'API : chacune traduit une demande de la page en un appel aux services.
const { AppError } = require('../errors');
const { pickFolder } = require('../folderPicker');
const { toPublic } = require('../store');
const { readJson, sendJson } = require('./respond');
const { serveMedia } = require('./static');

/**
 * Renvoie la table des routes. Dans un chemin, « :nom » capture un segment.
 * Un gestionnaire reçoit { req, res, params } et, pour les routes d'un salon, `room`.
 */
function createRoutes({ store, hub, conductor, agents }) {
  /** Enveloppe une route de salon : résout le salon, ou répond qu'il n'existe plus. */
  const withRoom = (handler) => (context) => {
    const room = store.get(context.params.roomId);
    if (!room) throw new AppError(404, 'room_not_found', 'Room not found.');
    return handler({ ...context, room });
  };
  const ok = (res) => sendJson(res, 200, { ok: true });

  return [
    ['GET', '/api/events', ({ req, res }) => {
      const installed = Object.fromEntries([...agents.values()].map((agent) => [agent.id, !!agent.binary]));
      hub.subscribe(req, res, { rooms: store.all().map(toPublic), agents: installed });
    }],

    ['GET', '/api/media/:roomId/:file', ({ res, params }) => serveMedia(res, store.mediaDirOf(params.roomId), params.file)],

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
  ];
}

module.exports = { createRoutes };
