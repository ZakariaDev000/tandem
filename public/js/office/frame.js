// Une image du bureau : le décor, puis les meubles et les personnages, du fond vers l'avant.
import { AGENT_IDS } from '../participants.js';
import { isAtTable, isAtWork } from './actors.js';
import { drawCharacter } from './characters.js';
import { HOME, TABLE } from './layout.js';
import { drawBackground, drawChair, drawDesk, drawTable } from './scene.js';

/** Dessine la scène telle qu'elle est à l'instant `now`. `actors` : les personnages, par identifiant. */
export function drawFrame(p, actors, now) {
  drawBackground(p, now);
  // Ce qui est plus bas à l'écran passe devant.
  const things = [];
  for (const id of AGENT_IDS) {
    const lit = isAtWork(actors[id]) && !isAtTable(actors[id]);
    things.push({ y: HOME[id].y - 1, draw: () => drawChair(p, id) });
    things.push({ y: HOME[id].y + 1, draw: () => drawDesk(p, id, lit, now) });
  }
  const guests = AGENT_IDS.filter((id) => isAtTable(actors[id]));
  things.push({ y: TABLE.y + 1, draw: () => drawTable(p, guests, now) });
  for (const actor of Object.values(actors)) things.push({ y: actor.pos.y, draw: () => drawCharacter(p, actor, now) });
  things.sort((a, b) => a.y - b.y);
  for (const thing of things) thing.draw();
}
