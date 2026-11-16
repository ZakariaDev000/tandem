// Le protocole de conversation : ce qu'on dit aux IA, et comment on lit à qui elles répondent.
const { agents } = require('./agents');
const { USER, AGENT_IDS, displayName, otherAgent } = require('./participants');

/** Les consignes du salon pour une IA. */
function rules(room, agentId) {
  const self = displayName(agentId);
  const otherId = otherAgent(agentId);
  const other = displayName(otherId);
  const access =
    room.access === 'read'
      ? 'You may read the files in the working folder but not change them.'
      : 'You may read and change the files in the working folder, and nothing outside it.';
  // Une IA qui sait créer des images l'apprend ici ; l'autre apprend qu'elle peut lui en demander.
  let images = 'Images created in the working folder are shown to the user automatically.';
  if (agents.get(agentId).generatesImages) {
    images = 'You can generate images with your built-in tool. When asked for one, create it, save it in the working folder and mention its file name: the room shows it to the user automatically.';
  } else if (agents.get(otherId).generatesImages) {
    images = `${other} can generate images (logo, banner, illustration): ask it when one is needed. You can then open the file to look at it and ask for changes. ${images}`;
  }
  return [
    `You are ${self} in "Tandem", a local room where you work with ${other} (another AI, in its own session) and the user (a human).`,
    `Each turn you receive the new messages from the room. ${other} only sees what you write in your final reply, not your tools or what you read, so include the details it needs.`,
    `You both share the same working folder (${room.cwd}), which is your current directory: refer to files by their relative path. ${access}`,
    'Room rules:',
    '1. Write your message normally, short and concrete, in the language the user writes in.',
    `2. ALWAYS end with a final line on its own: [[to: ${otherId}]] if you expect a reply or an action from ${other}, or [[to: ${USER}]] if the work is done, if you need the user, or if there is nothing left to ask.`,
    `3. Do not message ${other} out of politeness or just to confirm: if nothing is left to do, address the user and the exchange stops.`,
    `4. ${images}`,
  ].join('\n');
}

function recipientLabel(to, reader) {
  if (to === 'both') return 'to everyone';
  if (to === reader) return 'to you';
  return 'to ' + displayName(to);
}

/**
 * Le message d'un tour : tout ce qui s'est dit dans le salon depuis le dernier tour de cette IA.
 * Renvoie null s'il n'y a rien de nouveau pour elle.
 */
function buildPrompt(room, agentId, { includeRules }) {
  const fresh = room.messages
    .slice(room.seen[agentId] || 0)
    .filter((message) => message.from !== agentId && message.from !== 'system');
  if (!fresh.length) return null;
  const parts = [];
  if (includeRules) parts.push(rules(room, agentId), '');
  parts.push('New messages in the room:', '');
  for (const message of fresh) {
    parts.push(`### ${displayName(message.from)} (${recipientLabel(message.to, agentId)})`, message.text, '');
  }
  // Le rappel évite qu'une IA oublie la balise après une longue réponse.
  parts.push('---', `Your turn. Reminder: end with a final line on its own, [[to: ${otherAgent(agentId)}]] or [[to: ${USER}]].`);
  return parts.join('\n');
}

const ROUTE_TAG = new RegExp(`\\[\\[\\s*to\\s*:\\s*(${[...AGENT_IDS, USER].join('|')})\\s*\\]\\]`, 'gi');

/** Sépare le texte d'une réponse de sa balise de destinataire. Sans balise, la réponse va à la personne. */
function parseReply(agentId, raw) {
  let to = USER;
  for (const match of raw.matchAll(ROUTE_TAG)) to = match[1].toLowerCase();
  // Une IA qui s'adresse à elle-même n'attend en réalité personne.
  if (to === agentId) to = USER;
  return { to, text: raw.replace(ROUTE_TAG, '').trim() || '(empty message)' };
}

module.exports = { rules, buildPrompt, parseReply };
