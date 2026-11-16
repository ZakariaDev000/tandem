// Le serveur HTTP : contrôle d'accès, aiguillage vers les routes, fichiers de la page.
const http = require('node:http');
const { AppError } = require('../errors');
const { sendError } = require('./respond');
const { createRoutes } = require('./routes');
const { servePublicFile } = require('./static');

/** Compare un chemin à un modèle (« /api/rooms/:roomId »). Renvoie les segments capturés, ou null. */
function matchPath(pattern, segments) {
  const expected = pattern.split('/').filter(Boolean);
  if (expected.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith(':')) {
      // Un « % » mal formé dans l'adresse ferait échouer le décodage : la route ne correspond pas, voilà tout.
      try {
        params[expected[i].slice(1)] = decodeURIComponent(segments[i]);
      } catch {
        return null;
      }
    }
    else if (expected[i] !== segments[i]) return null;
  }
  return params;
}

function createHttpServer({ config, ...services }) {
  const routes = createRoutes(services);
  const allowedHosts = new Set([`127.0.0.1:${config.PORT}`, `localhost:${config.PORT}`]);

  return http.createServer(async (req, res) => {
    try {
      // La page n'est servie qu'à cette machine. Vérifier l'en-tête Host bloque aussi un site
      // qui ferait pointer son propre nom de domaine vers 127.0.0.1.
      if (!allowedHosts.has(req.headers.host || '')) throw new AppError(403, 'host_refused', 'Host not allowed.');
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') throw new AppError(405, 'method_not_allowed', 'Method not allowed.');
        return servePublicFile(res, config.PUBLIC_DIR, url.pathname);
      }

      // Toute action exige un en-tête qu'un autre site ouvert dans le navigateur ne peut pas envoyer.
      if (req.method !== 'GET' && req.headers['x-tandem'] !== '1') throw new AppError(403, 'forbidden', 'Request refused.');

      const segments = url.pathname.split('/').filter(Boolean);
      for (const [method, pattern, handler] of routes) {
        if (method !== req.method) continue;
        const params = matchPath(pattern, segments);
        if (params) return await handler({ req, res, params });
      }
      throw new AppError(404, 'not_found', 'Not found.');
    } catch (error) {
      sendError(res, error);
    }
  });
}

module.exports = { createHttpServer };
