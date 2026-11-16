// Petits outils HTTP partagés par les routes.
const { AppError } = require('../errors');

const MAX_BODY_BYTES = 2e6;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendError(res, error) {
  if (error instanceof AppError) return sendJson(res, error.status, { error: error.code, message: error.message });
  sendJson(res, 500, { error: 'server_error', message: error.message });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) reject(new AppError(413, 'body_too_large', 'Request body too large.'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new AppError(400, 'invalid_json', 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { sendJson, sendError, readJson };
