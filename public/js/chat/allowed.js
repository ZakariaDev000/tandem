// Ce que la personne a autorisé pour toujours dans le salon affiché : la liste, sous l'en-tête,
// où chaque autorisation peut être retirée.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { byId } from '../dom.js';

function ruleElement(roomId, rule) {
  const item = document.createElement('li');
  const what = document.createElement('code');
  what.textContent = rule.summary;
  what.title = rule.summary;
  const revoke = document.createElement('button');
  revoke.type = 'button';
  revoke.className = 'btn small ghost';
  revoke.textContent = '✕';
  revoke.title = t('allowed.revoke');
  revoke.setAttribute('aria-label', t('allowed.revoke'));
  revoke.addEventListener('click', () => api.revokeAllowed(roomId, rule.id).catch((err) => alert(err.message)));
  item.append(what, revoke);
  return item;
}

export function createAllowedList({ store }) {
  const box = byId('allowed');
  let shown = '';

  function render() {
    const room = store.current();
    const rules = room ? room.allowed : [];
    // Le salon annonce souvent son état : la liste n'est refaite que si elle a changé.
    const wanted = JSON.stringify([room && room.id, rules]);
    if (wanted === shown) return;
    shown = wanted;
    box.hidden = !rules.length;
    const title = document.createElement('summary');
    title.textContent = t('allowed.title', { n: rules.length });
    const list = document.createElement('ul');
    list.append(...rules.map((rule) => ruleElement(room.id, rule)));
    // Seul le contenu est refait : la liste reste dépliée si elle l'était.
    box.replaceChildren(title, list);
  }

  return { render };
}
