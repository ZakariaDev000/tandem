// Qui prend part à un salon : la personne et les deux agents.
// Les noms des agents sont des marques, ils ne se traduisent pas.
export const USER = 'user';

// Destinataire d'un message adressé aux deux agents à la fois.
export const BOTH = 'both';

// Auteur des messages que le serveur écrit lui-même (arrêt, échec).
export const SYSTEM = 'system';

export const AGENTS = {
  claude: { name: 'Claude', initial: 'C' },
  chatgpt: { name: 'ChatGPT', initial: 'G' },
};

export const AGENT_IDS = Object.keys(AGENTS);
export const PARTICIPANT_IDS = [...AGENT_IDS, USER];

export const isAgent = (id) => AGENT_IDS.includes(id);
