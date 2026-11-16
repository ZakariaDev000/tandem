// Tandem — point d'entrée de la page. Crée chaque pièce (état, bureau, conversation)
// et les relie : ce que le serveur annonce met l'état à jour, puis ce qui en dépend à l'écran.
import { apply as translatePage } from './i18n/index.js';
import { subscribe } from './api.js';
import { byId } from './dom.js';
import { actionText } from './format.js';
import { AGENT_IDS, SYSTEM, USER } from './participants.js';
import { createSidebar } from './sidebar.js';
import { initTheme } from './theme.js';
import { showUnreadInTitle } from './page-title.js';
import { isBusy } from './room-state.js';
import { createStore } from './store.js';
import { createOffice } from './office/index.js';
import { createAllowedList } from './chat/allowed.js';
import { initChanges } from './chat/changes.js';
import { createComposer } from './chat/composer.js';
import { createHeader } from './chat/header.js';
import { attachedImages, attachmentNames } from './chat/message-attachments.js';
import { initRoomDialog } from './chat/room-dialog.js';
import { createRoomList } from './chat/room-list.js';
import { createThread } from './chat/thread.js';
import { createNotifier } from './notify/notifier.js';
import { createRoomAlerts } from './notify/room-alerts.js';
import { initNotifySettings } from './notify/settings.js';
import { createUnread } from './unread.js';
import { createUpdateUi } from './update.js';

translatePage();
initTheme();

const store = createStore();
const office = createOffice(byId('scene'), byId('overlay'));
const sidebar = createSidebar();
const unread = createUnread({ store, onSeen: renderRooms });
const roomList = createRoomList({ store, unread, onSelect: select, reveal: () => sidebar.expand() });
const header = createHeader({ store });
const thread = createThread({ store });
const allowed = createAllowedList({ store });
initChanges({ store });
const composer = createComposer({ store, onTargetChange: (target) => office.setTarget(target) });
const updates = createUpdateUi({ hasDraft: () => composer.hasDraft() });
// `notifier.notify({ title, body, roomId })` sert à tout module qui doit attirer l'attention de la personne.
const notifier = createNotifier({ isWatching: unread.isWatching, onOpen: (id) => store.has(id) && select(id) });
const alerts = createRoomAlerts({ store, notify: notifier.notify });
initNotifySettings({ notifier });

/** Dans le bureau, travaillent les agents qui répondent dans le salon affiché : un seul, ou les deux en parallèle. */
function syncOffice() {
  const room = store.current();
  for (const id of AGENT_IDS) {
    const working = !!room && room.running.includes(id);
    office.setWorking(id, working, working ? actionText(store.liveAction(room.id, id)) : '');
  }
}

/** La liste des salons, et ce qui la résume quand elle est repliée ou que l'onglet est en arrière-plan. */
function renderRooms() {
  roomList.render();
  sidebar.flagUnread(unread.count > 0);
  showUnreadInTitle(unread.count);
}

/** Affiche un salon, ou l'écran d'accueil s'il n'existe pas. */
function select(id) {
  store.select(id);
  unread.seeCurrent();
  office.reset();
  renderRooms();
  header.render();
  allowed.render();
  thread.render();
  syncOffice();
  composer.showRoom();
  if (store.currentId) composer.focus();
}

initRoomDialog({
  onCreated(room) {
    // La réponse du serveur fait foi, même si l'événement « room-created » est arrivé avant elle.
    store.put(room);
    select(room.id);
  },
});

// Cliquer un agent dans le bureau le choisit comme destinataire.
office.onPick((id) => {
  composer.toggleTarget(id);
  composer.focus();
});

subscribe({
  // Envoyé à chaque connexion, donc aussi après une coupure : on repart de la liste complète.
  hello({ rooms, ...server }) {
    updates.onHello(server);
    store.replaceAll(rooms);
    select(store.preferredId());
  },

  roomCreated(room) {
    if (!store.has(room.id)) store.put(room);
    if (!store.currentId) select(room.id);
    else renderRooms();
  },

  roomDeleted({ id }) {
    const wasCurrent = id === store.currentId;
    store.remove(id);
    if (wasCurrent) select(store.newestId());
    else renderRooms();
  },

  room(meta) {
    const known = store.get(meta.id);
    const wasBusy = !!known && isBusy(known);
    const room = store.update(meta);
    if (!room) return;
    alerts.onRoomChange(room, wasBusy);
    renderRooms();
    if (room.id !== store.currentId) return;
    header.render();
    allowed.render();
    thread.renderLive();
    syncOffice();
    thread.scrollDown();
  },

  message({ roomId, message }) {
    const room = store.addMessage(roomId, message);
    if (!room) return;
    if (message.from !== USER) unread.add(roomId);
    alerts.onMessage(room, message);
    // Un message remonte son salon en tête de liste.
    renderRooms();
    if (roomId !== store.currentId) return;
    thread.append(message);
    header.render();
    thread.scrollDown();
    if (message.from !== SYSTEM) {
      const image = [...(message.images || []), ...attachedImages(message)][0];
      // Un message fait seulement de fichiers joints annonce leurs noms.
      office.deliver(message.from, message.to, message.text || attachmentNames(message), image ? image.url : null);
    }
  },

  settings: (settings) => updates.onSettings(settings),
  update: (update) => updates.onUpdate(update),

  activity({ roomId, agent, action }) {
    store.setLiveAction(roomId, agent, action);
    if (roomId !== store.currentId) return;
    office.setWorking(agent, true, actionText(action));
    thread.renderLive();
  },
});
