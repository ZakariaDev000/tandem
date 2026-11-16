// L'état des salons : ceux qui existent, celui qui est affiché, et la dernière
// action en cours de chaque agent. Rien ici ne touche à la page.

const STORAGE_KEY = 'tandem.room';

// Le stockage du navigateur peut être refusé (navigation privée, réglages) : on s'en passe alors.
function remember(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id || '');
  } catch {}
}

function recall() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function createStore() {
  const rooms = new Map();
  const liveActions = new Map(); // salon -> dernière action en cours de chaque agent

  function actionsOf(roomId) {
    if (!liveActions.has(roomId)) liveActions.set(roomId, new Map());
    return liveActions.get(roomId);
  }
  let currentId = null;

  const newestFirst = () => [...rooms.values()].sort((a, b) => b.createdAt - a.createdAt);

  const newestId = () => {
    const first = newestFirst()[0];
    return first ? first.id : null;
  };

  return {
    get currentId() {
      return currentId;
    },
    get isEmpty() {
      return rooms.size === 0;
    },
    has: (id) => rooms.has(id),
    current: () => rooms.get(currentId),
    newestFirst,
    newestId,

    /** Le salon à rouvrir : celui déjà affiché, sinon le dernier consulté, sinon le plus récent. */
    preferredId() {
      const wanted = currentId || recall();
      return rooms.has(wanted) ? wanted : newestId();
    },

    /** Affiche un salon, ou aucun s'il n'existe pas, et s'en souvient pour la prochaine visite. */
    select(id) {
      currentId = rooms.has(id) ? id : null;
      remember(currentId);
    },

    replaceAll(list) {
      rooms.clear();
      for (const room of list) rooms.set(room.id, room);
    },

    put(room) {
      rooms.set(room.id, room);
    },

    remove(id) {
      rooms.delete(id);
    },

    /** Applique les nouvelles propriétés d'un salon. Renvoie le salon, ou rien s'il est inconnu. */
    update(meta) {
      const room = rooms.get(meta.id);
      if (!room) return undefined;
      Object.assign(room, meta);
      // Un agent qui a fini son tour n'a plus d'action en cours.
      const actions = actionsOf(room.id);
      for (const agentId of actions.keys()) if (!room.running.includes(agentId)) actions.delete(agentId);
      return room;
    },

    /** Ajoute un message à un salon. Renvoie le salon, ou rien s'il est inconnu. */
    addMessage(roomId, message) {
      const room = rooms.get(roomId);
      if (room) room.messages.push(message);
      return room;
    },

    liveAction: (roomId, agentId) => actionsOf(roomId).get(agentId),

    setLiveAction(roomId, agentId, action) {
      actionsOf(roomId).set(agentId, action);
    },
  };
}
