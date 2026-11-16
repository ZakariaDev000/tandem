// Les trajets : par où passer d'un endroit à un autre sans traverser les meubles.
// Tout se fait à angle droit. Aucun état ici, seulement de la géométrie sur layout.js.
import { AISLE_Y, EXIT, HOME, TABLE } from './layout.js';

const PLACES = ['home', 'table'];
const EPSILON = 0.001;

const near = (a, b) => Math.abs(a - b) < EPSILON;
const within = (value, a, b) => value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;

/**
 * Le chemin d'accès d'un lieu : du lieu jusqu'au plancher libre, où l'on circule sans obstacle.
 * Un agent passe derrière les meubles puis descend par l'allée de son côté.
 */
function approach(id, place) {
  const exit = EXIT[id];
  // La personne n'a rien à contourner : son tapis est déjà sur le plancher libre.
  if (!exit) return [HOME[id]];
  const lane = [exit, { x: exit.x, y: AISLE_Y }];
  if (place === 'table') {
    const seat = TABLE.seats[id];
    return [seat, { x: exit.x, y: seat.y }, ...lane];
  }
  return [HOME[id], ...lane];
}

/** Où se tient `id` quand il est à `place`. */
export const placeOf = (id, place) => approach(id, place)[0];

/** Le rang du tronçon de `line` sur lequel se trouve `point`, ou -1. */
function segmentAt(line, point) {
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k];
    const b = line[k + 1];
    const onVertical = near(a.x, b.x) && near(point.x, a.x) && within(point.y, a.y, b.y);
    const onHorizontal = near(a.y, b.y) && near(point.y, a.y) && within(point.x, a.x, b.x);
    if (onVertical || onHorizontal) return k;
  }
  return -1;
}

/** De `from` jusqu'au plancher libre : la fin du chemin d'accès où il se trouve, ou lui seul s'il y est déjà. */
function wayOut(id, from) {
  for (const place of PLACES) {
    const line = approach(id, place);
    const k = segmentAt(line, from);
    if (k >= 0) return [from, ...line.slice(k + 1)];
  }
  return [from];
}

/** Sans les étapes en double, et en copies : un trajet se consomme au fil de la marche. */
function tidy(points) {
  const path = [];
  for (const point of points) {
    const last = path[path.length - 1];
    if (!last || !near(last.x, point.x) || !near(last.y, point.y)) path.push({ x: point.x, y: point.y });
  }
  return path;
}

/**
 * Le trajet de `from` jusqu'au début de `target`, un chemin d'accès (ou un simple point du plancher).
 * `lateralFirst` : sur le plancher, on se déplace d'abord de côté, puis en profondeur.
 */
function plan(id, from, target, lateralFirst) {
  const out = wayOut(id, from);
  // Les deux chemins se rejoignent avant le plancher : inutile d'y descendre.
  for (let i = 0; i < out.length; i++) {
    const k = segmentAt(target, out[i]);
    if (k >= 0) return tidy([...out.slice(1, i + 1), ...target.slice(0, k + 1).reverse()]);
  }
  const a = out[out.length - 1];
  const b = target[target.length - 1];
  const corner = lateralFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  return tidy([...out.slice(1), corner, ...target.slice().reverse()]);
}

/** Vers un point du plancher : on sort des meubles, on avance en profondeur, puis de côté. */
export const routeToSpot = (id, from, spot) => plan(id, from, [spot], false);

/** Vers son poste (`home` ou `table`) : on se range d'abord dans son allée, puis on la remonte. */
export const routeToStation = (id, from, station) => plan(id, from, approach(id, station), true);
