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
  if (!res.ok) {
    // Le serveur renvoie un code d'erreur ; la page le dit dans la langue de la personne.
    const key = 'error.' + data.error;
    const known = t(key);
    throw new Error(known !== key ? known : data.message || t('error.generic'));
  }
  return data;
}

export const createRoom = ({ title, cwd, access }) => request('POST', '/api/rooms', { title, cwd, access });
export const deleteRoom = (roomId) => request('DELETE', `/api/rooms/${roomId}`);
export const sendMessage = (roomId, { to, text, parallel }) => request('POST', `/api/rooms/${roomId}/messages`, { to, text, parallel });
export const setPaused = (roomId, paused) => request('POST', `/api/rooms/${roomId}/pause`, { paused });
export const stopRoom = (roomId) => request('POST', `/api/rooms/${roomId}/stop`);
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
