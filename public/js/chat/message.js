// Un message du fil : avatar, auteur, texte, images et actions menées.
import { t } from '../i18n/index.js';
import { actionText, clock, displayName, initial, recipientLabel, systemText } from '../format.js';
import { escapeHtml, renderMarkdown } from '../markdown.js';
import { SYSTEM } from '../participants.js';
import { addCopyButtons } from './code-copy.js';
import { attachedFilesHtml, attachedImages } from './message-attachments.js';

function imagesHtml(images) {
  if (!images || !images.length) return '';
  const links = images.map((image) => {
    const url = escapeHtml(image.url);
    const name = escapeHtml(image.name);
    const title = escapeHtml(t('image.open', { name: image.name }));
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" title="${title}"><img src="${url}" alt="${name}" loading="lazy"><span>${name}</span></a>`;
  });
  return `<div class="images">${links.join('')}</div>`;
}

function actionsHtml(actions) {
  const count = actions ? actions.length : 0;
  if (!count) return '';
  const summary = count === 1 ? t('actions.one') : t('actions.many', { n: count });
  const items = actions.map((action) => '<li>' + escapeHtml(actionText(action)) + '</li>').join('');
  return `<details class="actions-done"><summary>${summary}</summary><ul>${items}</ul></details>`;
}

function systemElement(message) {
  const el = document.createElement('div');
  el.className = 'sys' + (message.kind === 'error' ? ' error' : '');
  el.textContent = systemText(message);
  return el;
}

/** Construit l'élément d'un message. `onImageLoad` est appelé quand une de ses images a fini de charger. */
export function messageElement(message, { onImageLoad }) {
  if (message.from === SYSTEM) return systemElement(message);
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `<div class="avatar ${message.from}" aria-hidden="true">${initial(message.from)}</div>
      <div class="body">
        <div class="who">${escapeHtml(displayName(message.from))} <span class="to">→ ${escapeHtml(recipientLabel(message))}</span><time>${clock(message.ts)}</time></div>
        <div class="text">${renderMarkdown(message.text)}</div>${imagesHtml([...(message.images || []), ...attachedImages(message)])}${attachedFilesHtml(message)}${actionsHtml(message.actions)}
      </div>`;
  addCopyButtons(el);
  for (const img of el.querySelectorAll('.images img')) img.addEventListener('load', onImageLoad, { once: true });
  return el;
}
