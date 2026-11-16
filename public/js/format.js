// Comment la page nomme les choses : participants, actions, messages du système, heures.
import { lang, t } from './i18n/index.js';
import { AGENTS, BOTH, USER, isAgent } from './participants.js';

export const displayName = (id) => (id === USER ? t('office.you') : isAgent(id) ? AGENTS[id].name : id);

/** La lettre de l'avatar. Pour la personne, c'est celle de « Toi » dans sa langue. */
export const initial = (id) => (id === USER ? t('office.you').charAt(0) : isAgent(id) ? AGENTS[id].initial : '');

/** Met une action en mots. Les anciens salons gardent leurs actions déjà rédigées. */
export function actionText(action) {
  if (!action) return '';
  if (typeof action === 'string') return action;
  if (action.verb === 'edit' && !action.target) return t('action.editFiles');
  return t('action.' + action.verb, { target: action.target });
}

/** Le texte d'un message du système. Les anciens salons n'ont que le texte déjà rédigé. */
export function systemText(message) {
  if (message.code === 'stopped') return t('system.stopped', { name: displayName(message.agent) });
  if (message.code === 'failed') return t('system.failed', { name: displayName(message.agent), detail: message.detail || '' });
  if (message.code === 'approval') return t('system.approval.' + message.decision, { name: displayName(message.agent), detail: message.detail });
  return message.text || '';
}

export function recipientLabel(message) {
  if (message.to === BOTH) return message.parallel ? t('to.bothParallel') : t('to.both');
  if (message.to === USER) return t('to.you');
  return t('to.name', { name: displayName(message.to) });
}

export const clock = (ts) => new Date(ts).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

export const dayAndMonth = (date) => date.toLocaleDateString(lang, { day: 'numeric', month: 'long' });
