// Les onglets des salons dans la barre du haut, et l'écran d'accueil quand il n'y en a aucun.
import { byId } from '../dom.js';

export function createRoomTabs({ store, onSelect }) {
  const nav = byId('rooms');
  const app = byId('app');
  const welcome = byId('empty');

  function tab(room) {
    const button = document.createElement('button');
    button.setAttribute('aria-current', room.id === store.currentId ? 'true' : 'false');
    const dot = document.createElement('span');
    dot.className = 'dot' + (room.running ? ' on' : '');
    button.append(dot, room.title);
    button.addEventListener('click', () => onSelect(room.id));
    return button;
  }

  function render() {
    nav.replaceChildren(...store.newestFirst().map(tab));
    app.hidden = store.isEmpty;
    welcome.hidden = !store.isEmpty;
  }

  return { render };
}
