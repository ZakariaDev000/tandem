// Les demandes d'autorisation du salon affiché : pour chacune, une carte qui dit ce que l'agent
// veut faire et laisse la personne répondre.
import { t } from '../i18n/index.js';
import * as api from '../api.js';
import { actionText, clock, displayName, initial } from '../format.js';
import { escapeHtml } from '../markdown.js';

// Les réponses possibles, dans l'ordre des boutons, avec l'allure de chacun.
const DECISIONS = [
  ['allow', 'primary'],
  ['always', ''],
  ['refuse', 'danger'],
];

function cardElement(roomId, request) {
  const card = document.createElement('div');
  card.className = 'msg approval';
  const buttons = DECISIONS.map(([decision, look]) => `<button type="button" class="btn small ${look}" data-decision="${decision}">${escapeHtml(t('approval.' + decision))}</button>`);
  card.innerHTML = `<div class="avatar ${escapeHtml(request.agent)}" aria-hidden="true">${escapeHtml(initial(request.agent))}</div>
      <div class="body">
        <div class="who">${escapeHtml(t('approval.title', { name: displayName(request.agent) }))}<time>${clock(request.ts)}</time></div>
        <p class="note">${escapeHtml(actionText(request.action))}</p>
        <pre class="approval-what"></pre>
        <details class="actions-done"><summary>${escapeHtml(t('approval.details'))}</summary><pre></pre></details>
        <div class="approval-buttons">${buttons.join('')}</div>
      </div>`;
  // Ce que l'agent veut faire vient de lui : ce n'est jamais lu comme du HTML.
  card.querySelector('.approval-what').textContent = request.summary;
  card.querySelector('details pre').textContent = JSON.stringify(request.input, null, 2);

  const choices = card.querySelectorAll('[data-decision]');
  const setDisabled = (disabled) => choices.forEach((button) => (button.disabled = disabled));
  for (const button of choices) {
    button.addEventListener('click', async () => {
      // La carte s'en va quand le serveur annonce la réponse ; d'ici là, un second clic ne compte pas.
      setDisabled(true);
      try {
        await api.answerApproval(roomId, request.id, button.dataset.decision);
      } catch (err) {
        setDisabled(false);
        alert(err.message);
      }
    });
  }
  return card;
}

export function createApprovals({ store }) {
  const cards = new Map(); // demande -> sa carte, gardée tant que la demande attend

  /** Les cartes des demandes en attente, dans l'ordre. Celles des demandes réglées sont retirées. */
  function sync() {
    const room = store.current();
    const pending = room ? room.approvals : [];
    for (const [id, card] of cards) {
      if (pending.some((request) => request.id === id)) continue;
      card.remove();
      cards.delete(id);
    }
    return pending.map((request) => {
      if (!cards.has(request.id)) cards.set(request.id, cardElement(room.id, request));
      return cards.get(request.id);
    });
  }

  return {
    /**
     * Range les cartes au bas du fil. Une carte déjà à sa place n'est pas déplacée :
     * elle y perdrait le focus et le défilement d'une longue commande.
     */
    place(thread) {
      const wanted = sync();
      const tail = [...thread.children].slice(-wanted.length);
      if (wanted.length && wanted.some((card, i) => tail[i] !== card)) thread.append(...wanted);
    },
  };
}
