// Le lien avec le serveur local. Seul ce module connaît les adresses, les en-têtes
// et les noms des événements ; le reste de la page appelle des fonctions.
import { t } from './i18n/index.js';

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    // Le serveur refuse toute action sans cet en-tête, qu'un autre site ne peut pas envoyer.
    headers: { 'Content-Type': 'application/json', 'X-Tandem': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw failure(data);
  return data;
}

/** Le serveur renvoie un code d'erreur ; la page le dit dans la langue de la personne. */
function failure(data) {
  const key = 'error.' + data.error;
  const known = t(key);
  return new Error(known !== key ? known : data.message || t('error.generic'));
}

export const createRoom = ({ title, cwd, access }) => request('POST', '/api/rooms', { title, cwd, access });
export const renameRoom = (roomId, title) => request('PATCH', `/api/rooms/${roomId}`, { title });
export const setArchived = (roomId, archived) => request('PATCH', `/api/rooms/${roomId}`, { archived });
export const deleteRoom = (roomId) => request('DELETE', `/api/rooms/${roomId}`);
export const sendMessage = (roomId, { to, text, parallel, attachments }) => request('POST', `/api/rooms/${roomId}/messages`, { to, text, parallel, attachments });
export const setPaused = (roomId, paused) => request('POST', `/api/rooms/${roomId}/pause`, { paused });
export const stopRoom = (roomId) => request('POST', `/api/rooms/${roomId}/stop`);
/** Répond à une demande d'autorisation : 'allow', 'always' (pour toujours dans ce salon) ou 'refuse'. */
export const answerApproval = (roomId, requestId, decision) => request('POST', `/api/rooms/${roomId}/approvals/${requestId}`, { decision });
export const revokeAllowed = (roomId, ruleId) => request('DELETE', `/api/rooms/${roomId}/allowed/${ruleId}`);

/** Le détail d'un fichier changé par un message, désigné par sa place dans la liste du message. */
export const fileChange = (roomId, messageId, index) => request('GET', `/api/rooms/${roomId}/messages/${encodeURIComponent(messageId)}/changes/${index}`);

export const saveSettings = (changes) => request('POST', '/api/settings', changes);
export const checkForUpdate = () => request('POST', '/api/update/check');
export const applyUpdate = () => request('POST', '/api/update/apply');

/** Ouvre la fenêtre de choix de dossier du système. Renvoie le chemin, ou null si on annule. */
export async function pickFolder(prompt) {
  const { path } = await request('POST', '/api/pick-folder', { prompt });
  return path;
}

/** Les limites que le serveur impose aux fichiers joints : { maxFileBytes, maxPerMessage }. */
export const attachmentLimits = () => request('GET', '/api/attachments/limits');
export const discardAttachment = (roomId, id) => request('DELETE', `/api/rooms/${roomId}/attachments/${id}`);

/**
 * Envoie un fichier à joindre au prochain message du salon. Renvoie `done`, tenue avec ce que
 * le serveur en a gardé (dont `id`, à donner à sendMessage), et `abort()` pour y renoncer.
 * `onProgress` reçoit la part déjà envoyée, de 0 à 1.
 */
export function uploadAttachment(roomId, file, onProgress) {
  // fetch ne dit pas où en est un envoi : XMLHttpRequest, si.
  const xhr = new XMLHttpRequest();
  const done = new Promise((resolve, reject) => {
    // Seul le code d'erreur est repris : le texte du serveur ne s'affiche jamais tel quel.
    const fail = () => reject(failure({ error: xhr.response?.error }));
    xhr.upload.addEventListener('progress', (event) => event.lengthComputable && onProgress(event.loaded / event.total));
    xhr.addEventListener('load', () => (xhr.status === 200 ? resolve(xhr.response) : fail()));
    xhr.addEventListener('error', fail);
    xhr.addEventListener('abort', fail);
  });
  // Le corps de la requête est le fichier lui-même ; son nom voyage dans l'adresse.
  xhr.open('POST', `/api/rooms/${roomId}/attachments?name=${encodeURIComponent(file.name)}`);
  xhr.setRequestHeader('X-Tandem', '1');
  xhr.responseType = 'json';
  xhr.send(file);
  return { done, abort: () => xhr.abort() };
}

const EVENT_NAMES = {
  hello: 'hello',
  room: 'room',
  roomCreated: 'room-created',
  roomDeleted: 'room-deleted',
  message: 'message',
  activity: 'activity',
  settings: 'settings',
  update: 'update',
};

/**
 * Écoute les événements du serveur. `handlers` associe une fonction à chaque
 * événement de EVENT_NAMES ; elle reçoit les données déjà décodées.
 * Le navigateur se reconnecte seul, et le serveur renvoie alors « hello ».
 */
export function subscribe(handlers) {
  const source = new EventSource('/api/events');
  for (const [name, handler] of Object.entries(handlers)) {
    source.addEventListener(EVENT_NAMES[name], (event) => handler(JSON.parse(event.data)));
  }
}
