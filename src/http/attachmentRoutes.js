// Les routes des fichiers joints : envoi au fil de l'eau, renoncement, affichage ou téléchargement.
const { URL_PREFIX, LIMITS, isImage } = require('../attachments');
const { sendJson } = require('./respond');
const { serveAttachment } = require('./static');

/** Renvoie les routes des fichiers joints. `withRoom` résout le salon nommé dans le chemin. */
function createAttachmentRoutes({ attachments, withRoom }) {
  return [
    ['GET', `${URL_PREFIX}/limits`, ({ res }) => sendJson(res, 200, LIMITS)],

    // Sans analyseur multipart : le corps de la requête est le fichier, son nom voyage dans l'adresse.
    ['POST', '/api/rooms/:roomId/attachments', withRoom(async ({ req, res, room }) => {
      const name = new URL(req.url, 'http://localhost').searchParams.get('name');
      try {
        sendJson(res, 200, await attachments.receive(room.id, name, req, Number(req.headers['content-length'])));
      } catch (error) {
        // Un envoi refusé n'est pas lu jusqu'au bout : la réponse part, puis la connexion est coupée.
        res.setHeader('Connection', 'close');
        res.once('finish', () => req.destroy());
        throw error;
      }
    })],

    ['DELETE', '/api/rooms/:roomId/attachments/:id', withRoom(({ res, room, params }) => {
      attachments.discard(room.id, params.id);
      sendJson(res, 200, { ok: true });
    })],

    ['GET', `${URL_PREFIX}/:roomId/:file`, withRoom(({ res, room, params }) => {
      serveAttachment(res, attachments.locate(room.id, params.file), isImage(params.file));
    })],
  ];
}

module.exports = { createAttachmentRoutes };
