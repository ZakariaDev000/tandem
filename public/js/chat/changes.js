// Ce qu'un agent a changé pendant son tour : le bouton résumé sous son message, et la fenêtre
// qui liste les fichiers et montre, pour chacun, les lignes ajoutées et retirées.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { byId } from '../dom.js';
import { displayName } from '../format.js';
import { escapeHtml } from '../markdown.js';
import { diffTable } from './diff.js';

const STATUSES = ['added', 'modified', 'deleted', 'renamed'];

const countLabel = (changes) => (changes.count === 1 ? t('changes.one') : t('changes.many', { n: changes.count }));

/** « +12 −4 ». Un fichier binaire n'a pas de lignes à compter. */
function linesHtml({ added, removed, binary }) {
  if (binary) return '';
  return `<span class="lines-plus">+${escapeHtml(added)}</span> <span class="lines-minus">−${escapeHtml(removed)}</span>`;
}

const summaryHtml = (changes) => `${escapeHtml(countLabel(changes))} ${linesHtml(changes)}`;

/** Le bouton placé sous un message qui a changé des fichiers. Rien pour les autres messages. */
export function changesHtml(message) {
  const changes = message.changes;
  if (!changes || !changes.files || !changes.files.length) return '';
  return `<button type="button" class="btn small changes-open" data-changes="${escapeHtml(message.id)}">${summaryHtml(changes)}</button>`;
}

function paragraph(className, text) {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

/** Ce que le serveur dit d'un fichier, mis en forme : ses lignes, ou la raison de leur absence. */
function detailElement(detail) {
  if (detail.kind === 'binary') return paragraph('note', t('changes.binary'));
  if (detail.kind === 'too_large') return paragraph('note', t('changes.tooLarge'));
  return diffTable(detail.patch) || paragraph('note', t('changes.empty'));
}

/** Un fichier de la liste. Ses lignes ne sont demandées au serveur qu'à la première ouverture. */
function fileElement(roomId, messageId, file, index) {
  const status = STATUSES.includes(file.status) ? file.status : 'modified';
  const name = file.from ? `${file.from} → ${file.path}` : file.path;
  const el = document.createElement('details');
  el.className = 'change';
  el.innerHTML = `<summary><span class="change-status ${status}">${escapeHtml(t('changes.status.' + status))}</span><span class="change-path">${escapeHtml(name)}</span>${linesHtml(file)}</summary><div class="change-body"></div>`;
  const body = el.lastChild;
  let asked = false;

  async function load() {
    asked = true;
    body.replaceChildren(paragraph('note', t('changes.loading')));
    try {
      body.replaceChildren(detailElement(await api.fileChange(roomId, messageId, index)));
    } catch (error) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn small';
      retry.textContent = t('changes.retry');
      retry.addEventListener('click', load);
      body.replaceChildren(paragraph('error', error.message), retry);
    }
  }

  el.addEventListener('toggle', () => {
    if (el.open && !asked) load();
  });
  return el;
}

/** Branche la fenêtre des fichiers changés sur les boutons du fil. */
export function initChanges({ store }) {
  const dialog = byId('changes-dialog');
  const title = byId('changes-title');
  const summary = byId('changes-summary');
  const truncated = byId('changes-truncated');
  const list = byId('changes-files');

  function open(room, message) {
    const { changes } = message;
    title.textContent = t('changes.title', { name: displayName(message.from) });
    summary.innerHTML = summaryHtml(changes);
    truncated.hidden = !changes.truncated;
    truncated.textContent = t('changes.truncated', { shown: changes.files.length });
    list.replaceChildren(...changes.files.map((file, index) => fileElement(room.id, message.id, file, index)));
    dialog.showModal();
    // Le premier fichier s'ouvre tout seul : on voit des lignes sans avoir à cliquer.
    list.firstChild.open = true;
  }

  // Un seul écouteur pour tout le fil : les messages sont reconstruits à chaque changement de salon.
  byId('thread').addEventListener('click', (event) => {
    const button = event.target.closest('[data-changes]');
    const room = store.current();
    const message = button && room && room.messages.find((candidate) => candidate.id === button.dataset.changes);
    if (message) open(room, message);
  });
}
