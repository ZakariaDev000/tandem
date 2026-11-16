// Tandem — point d'entrée de la page. Crée chaque pièce (état, bureau, conversation)
// et les relie : ce que le serveur annonce met l'état à jour, puis ce qui en dépend à l'écran.
import { apply as translatePage } from './i18n/index.js';
import { subscribe } from './api.js';
import { byId } from './dom.js';
import { actionText } from './format.js';
import { AGENT_IDS, SYSTEM } from './participants.js';
import { createStore } from './store.js';
import { createOffice } from './office/index.js';
import { createAllowedList } from './chat/allowed.js';
import { createComposer } from './chat/composer.js';
import { createHeader } from './chat/header.js';
import { attachedImages, attachmentNames } from './chat/message-attachments.js';
import { initRoomDialog } from './chat/room-dialog.js';
import { createRoomTabs } from './chat/tabs.js';
import { createThread } from './chat/thread.js';
import { createUpdateUi } from './update.js';

translatePage();

const store = createStore();
const office = createOffice(byId('scene'), byId('overlay'));
const tabs = createRoomTabs({ store, onSelect: select });
const header = createHeader({ store });
const thread = createThread({ store });
const allowed = createAllowedList({ store });
const composer = createComposer({ store, onTargetChange: (target) => office.setTarget(target) });
const updates = createUpdateUi({ hasDraft: () => composer.hasDraft() });

/** Dans le bureau, travaillent les agents qui répondent dans le salon affiché : un seul, ou les deux en parallèle. */
function syncOffice() {
  const room = store.current();
  for (const id of AGENT_IDS) {
    const working = !!room && room.running.includes(id);
    office.setWorking(id, working, working ? actionText(store.liveAction(room.id, id)) : '');
  }
}

/** Affiche un salon, ou l'écran d'accueil s'il n'existe pas. */
function select(id) {
  store.select(id);
  office.reset();
  tabs.render();
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
    else tabs.render();
  },

  roomDeleted({ id }) {
    const wasCurrent = id === store.currentId;
    store.remove(id);
    if (wasCurrent) select(store.newestId());
    else tabs.render();
  },

  room(meta) {
    const room = store.update(meta);
    if (!room) return;
    tabs.render();
    if (room.id !== store.currentId) return;
    header.render();
    allowed.render();
    thread.renderLive();
    syncOffice();
    thread.scrollDown();
  },

  message({ roomId, message }) {
    if (!store.addMessage(roomId, message) || roomId !== store.currentId) return;
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
