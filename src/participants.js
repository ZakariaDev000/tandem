// Qui parle dans un salon : la personne, et les IA déclarées dans agents/.
const { agents } = require('./agents');

const USER = 'user';
const AGENT_IDS = [...agents.keys()];
const NAMES = { [USER]: 'User', ...Object.fromEntries([...agents.values()].map((agent) => [agent.id, agent.name])) };

const isAgent = (id) => agents.has(id);
const displayName = (id) => NAMES[id] || id;
/** L'IA à qui l'on s'adresse quand on ne parle pas à la personne. */
const otherAgent = (id) => AGENT_IDS.find((other) => other !== id);

module.exports = { USER, AGENT_IDS, isAgent, displayName, otherAgent };
