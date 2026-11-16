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

// En-têtes de tout fichier gardé pour un salon : aucun ne doit pouvoir agir sur la page.
const STORED_FILE_HEADERS = {
  // Chaque copie a un nom unique et ne change jamais : le navigateur peut la garder.
  'Cache-Control': 'private, max-age=31536000, immutable',
  'X-Content-Type-Options': 'nosniff',
  // « sandbox » empêche un fichier ouvert seul d'exécuter du code sur cette page.
  'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
};

const imageTypeOf = (file) => {
  const type = MIME_TYPES[path.extname(file)];
  return type && type.startsWith('image/') ? type : null;
};

/** Sert une image gardée par un salon. */
function serveMedia(res, mediaDir, fileName) {
  // basename : le nom reçu ne peut désigner qu'un fichier de ce dossier.
  const file = path.join(mediaDir, path.basename(fileName));
  const type = imageTypeOf(file);
  if (!type || !isFile(file)) throw new AppError(404, 'image_not_found', 'Image not found.');
  res.writeHead(200, { ...STORED_FILE_HEADERS, 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
}

/**
 * Sert un fichier joint par la personne. `inline` est décidé par le serveur, jamais par la page :
 * seule une image reconnue s'affiche, tout autre fichier est proposé en téléchargement.
 */
function serveAttachment(res, file, inline) {
  if (!isFile(file)) throw new AppError(404, 'attachment_not_found', 'Attachment not found.');
  const type = inline ? imageTypeOf(file) : null;
  res.writeHead(200, {
    ...STORED_FILE_HEADERS,
    'Content-Type': type || 'application/octet-stream',
    ...(!type && { 'Content-Disposition': 'attachment' }),
  });
  fs.createReadStream(file).pipe(res);
}

module.exports = { servePublicFile, serveMedia, serveAttachment };
