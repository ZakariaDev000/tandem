// Les dimensions de la scène et la place de chacun, en pixels de scène.
// Le canvas de index.html a la même taille ; le navigateur l'agrandit ensuite.
export const SCENE = { width: 256, height: 144 };

// La place de repos : au bureau pour les agents, sur le tapis pour la personne.
export const HOME = { claude: { x: 64, y: 66 }, chatgpt: { x: 192, y: 66 }, user: { x: 128, y: 128 } };

// Par où un agent quitte et regagne son bureau, pour ne pas le traverser.
export const EXIT = { claude: { x: 100, y: 66 }, chatgpt: { x: 156, y: 66 } };

// Où se placer pour parler à quelqu'un, selon qui vient.
export const MEET = {
  claude: { chatgpt: { x: 152, y: 92 }, user: { x: 112, y: 126 } },
  chatgpt: { claude: { x: 104, y: 92 }, user: { x: 144, y: 126 } },
  user: { claude: { x: 104, y: 96 }, chatgpt: { x: 152, y: 96 }, both: { x: 128, y: 100 } },
};
