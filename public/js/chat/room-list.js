// La liste des salons dans le volet de gauche : recherche, renommage, archivage,
// et l'écran d'accueil quand il n'y a aucun salon.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { byId } from '../dom.js';

/** Sans casse ni accents : « securite » trouve « Sécurité ». */
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const reportError = (err) => alert(err.message);

function span(className, text = '') {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * `unread` dit quels salons ont des messages non lus ; `onSelect` reçoit le salon à afficher ;
 * `reveal` rend la liste visible quand le raccourci de recherche est utilisé alors qu'elle est repliée.
 */
export function createRoomList({ store, unread, onSelect, reveal }) {
  const active = byId('rooms');
  const archived = byId('rooms-archived');
  const archivedGroup = byId('archived-group');
  const archivedCount = byId('archived-count');
  const none = byId('rooms-none');
  const search = byId('room-search');
  const app = byId('app');
  const welcome = byId('empty');
  const lists = [active, archived];
  let renaming = null; // le salon dont le titre est en cours de saisie
  let missedRender = false;

  const find = (selector) => lists.map((list) => list.querySelector(selector)).find(Boolean);
  const control = (roomId, action) => find(`[data-room="${CSS.escape(roomId)}"][data-action="${action}"]`);

  function button(room, action, className) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.dataset.room = room.id;
    el.dataset.action = action;
    return el;
  }

  function tool(room, action, glyph, label) {
    const el = button(room, action, 'room-tool');
    el.textContent = glyph;
    el.title = label;
    el.setAttribute('aria-label', `${label}: ${room.title}`);
    return el;
  }

  function renameField(room) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'room-rename';
    input.value = room.title;
    input.setAttribute('aria-label', t('room.renameLabel'));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) endRename(input.value, true);
      else if (event.key === 'Escape') endRename(null, true);
    });
    input.addEventListener('blur', () => endRename(input.value, false));
    return input;
  }

  function row(room) {
    const isCurrent = room.id === store.currentId;
    const isRunning = room.running.length > 0;
    const isUnread = unread.has(room.id);
    const el = document.createElement('div');
    el.className = 'room-row' + (isCurrent ? ' current' : '') + (isUnread ? ' unread' : '');
    el.dataset.row = room.id;
    if (room.id === renaming) {
      el.append(renameField(room));
      return el;
    }
    const open = button(room, 'open', 'room');
    open.setAttribute('aria-current', String(isCurrent));
    open.title = room.title;
    // Une demande d'autorisation qui attend se voit depuis un autre salon.
    const isAsking = !!room.approvals && room.approvals.length > 0;
    open.append(span('dot' + (isAsking ? ' ask' : isRunning ? ' on' : '')), span('room-name', room.title));
    if (isUnread) open.append(span('unread-mark'));
    // Ce que les marques disent en couleur, un lecteur d'écran le reçoit en mots.
    const states = [isRunning && t('rooms.running'), isUnread && t('rooms.unread')].filter(Boolean);
    if (states.length) open.setAttribute('aria-label', [room.title, ...states].join(', '));
    el.append(
      open,
      tool(room, 'rename', '✎', t('room.rename')),
      room.archived ? tool(room, 'archive', '↑', t('room.unarchive')) : tool(room, 'archive', '↓', t('room.archive')),
    );
    return el;
  }

  function draw() {
    // La liste est reconstruite à chaque changement : le bouton qui avait le focus doit le retrouver.
    const focused = lists.some((list) => list.contains(document.activeElement)) ? { ...document.activeElement.dataset } : null;
    const query = fold(search.value.trim());
    const matching = store.recentFirst().filter((room) => !query || fold(room.title).includes(query));
    const shelved = matching.filter((room) => room.archived);
    active.replaceChildren(...matching.filter((room) => !room.archived).map(row));
    archived.replaceChildren(...shelved.map(row));
    archivedGroup.hidden = !shelved.length;
    archivedCount.textContent = t('rooms.archived', { n: shelved.length });
    none.hidden = matching.length > 0 || store.isEmpty;
    app.hidden = store.isEmpty;
    welcome.hidden = !store.isEmpty;
    const again = focused && focused.room && (control(focused.room, focused.action) || control(focused.room, 'open'));
    if (again) again.focus();
  }

  /** Une saisie en cours ne doit pas être effacée par un changement venu du serveur : il attend sa fin. */
  function render() {
    if (renaming) missedRender = true;
    else draw();
  }

  // Seule la ligne concernée est refaite : reconstruire toute la liste sous le pointeur
  // ferait perdre le clic qui vient de terminer la saisie.
  function redrawRow(room) {
    find(`[data-row="${CSS.escape(room.id)}"]`).replaceWith(row(room));
  }

  function startRename(roomId) {
    const room = store.get(roomId);
    if (!room) return;
    renaming = roomId;
    redrawRow(room);
    const input = find('.room-rename');
    input.focus();
    input.select();
  }

  /** Termine la saisie d'un titre. `title` vaut null quand la personne abandonne. */
  function endRename(title, refocus) {
    // Retirer le champ de la page lui fait perdre le focus : ce second appel n'a plus rien à faire.
    if (!renaming) return;
    const room = store.get(renaming);
    renaming = null;
    const wanted = (title || '').trim();
    if (room && wanted && wanted !== room.title) api.renameRoom(room.id, wanted).catch(reportError);
    if (missedRender || !room) draw();
    else redrawRow(room);
    missedRender = false;
    const back = refocus && room && control(room.id, 'open');
    if (back) back.focus();
  }

  /** Les flèches passent d'un salon à l'autre ; au-dessus du premier, il y a la recherche. */
  function moveFocus(from, step) {
    const reachable = (archivedGroup.open ? lists : [active]).flatMap((list) => [...list.querySelectorAll('.room')]);
    const next = reachable[reachable.indexOf(from) + step];
    if (next) next.focus();
    else if (step < 0) search.focus();
  }

  for (const list of lists) {
    list.addEventListener('click', (event) => {
      const clicked = event.target.closest('[data-action]');
      const room = clicked && store.get(clicked.dataset.room);
      if (!room) return;
      if (clicked.dataset.action === 'open') onSelect(room.id);
      else if (clicked.dataset.action === 'rename') startRename(room.id);
      else api.setArchived(room.id, !room.archived).catch(reportError);
    });

    list.addEventListener('dblclick', (event) => {
      const clicked = event.target.closest('.room');
      if (clicked) startRename(clicked.dataset.room);
    });

    list.addEventListener('keydown', (event) => {
      const from = event.target.closest('.room');
      if (!from) return;
      if (event.key === 'F2') startRename(from.dataset.room);
      else if (event.key === 'ArrowDown') moveFocus(from, 1);
      else if (event.key === 'ArrowUp') moveFocus(from, -1);
      else return;
      event.preventDefault();
    });
  }

  search.addEventListener('input', () => {
    draw();
    // Un salon archivé qui correspond à la recherche se montre sans clic de plus.
    if (search.value.trim() && archived.childElementCount) archivedGroup.open = true;
  });

  search.addEventListener('keydown', (event) => {
    const first = find('.room');
    if (event.key === 'Escape') {
      // Échap vide d'abord la recherche ; une seconde fois, il quitte le champ.
      if (!search.value) search.blur();
      search.value = '';
      draw();
    } else if (event.key === 'ArrowDown' && first) first.focus();
    else if (event.key === 'Enter' && first) onSelect(first.dataset.room);
    else return;
    event.preventDefault();
  });

  // « / » hors d'un champ de saisie, ou Ctrl+K (Cmd+K sur Mac) partout, mène à la recherche.
  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]');
    const modified = event.ctrlKey || event.metaKey;
    const wanted = event.altKey ? false : modified ? event.key.toLowerCase() === 'k' : event.key === '/' && !typing;
    // Une fenêtre ouverte garde le clavier pour elle.
    if (!wanted || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    reveal();
    search.focus();
    search.select();
  });

  return { render };
}
