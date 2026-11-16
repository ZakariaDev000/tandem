// Sert les fichiers de la page et les images gardées par les salons.
const fs = require('node:fs');
const path = require('node:path');
const { AppError } = require('../errors');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();

/** Sert un fichier de la page. Le chemin demandé ne peut pas sortir du dossier public. */
function servePublicFile(res, publicDir, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const file = path.join(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep) || !isFile(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

/** Sert une image gardée par un salon. */
function serveMedia(res, mediaDir, fileName) {
  // basename : le nom reçu ne peut désigner qu'un fichier de ce dossier.
  const file = path.join(mediaDir, path.basename(fileName));
  const type = MIME_TYPES[path.extname(file)];
  if (!type || !type.startsWith('image/') || !isFile(file)) throw new AppError(404, 'image_not_found', 'Image not found.');
  res.writeHead(200, {
    'Content-Type': type,
    // Chaque copie a un nom unique et ne change jamais : le navigateur peut la garder.
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // « sandbox » empêche un fichier SVG ouvert seul d'exécuter du code sur cette page.
    'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  });
  fs.createReadStream(file).pipe(res);
}

module.exports = { servePublicFile, serveMedia };
