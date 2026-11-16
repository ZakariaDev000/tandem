// Le correctif d'un fichier (format unifié de git) mis en tableau : numéros de ligne, signe, texte.
import { t } from '../i18n/index.js';

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
// Le premier caractère d'une ligne dit ce qu'elle est. Il reste affiché dans la marge :
// la couleur ne fait que le souligner.
const KINDS = { '+': 'add', '-': 'del', ' ': 'same' };

/** Découpe un correctif en lignes : en-tête de bloc, ajout, retrait, ligne inchangée. */
export function parsePatch(patch) {
  const rows = [];
  let oldNo = 0;
  let newNo = 0;
  for (const line of patch.split('\n')) {
    const header = line.match(HUNK_HEADER);
    if (header) {
      oldNo = Number(header[1]);
      newNo = Number(header[2]);
      rows.push({ kind: 'hunk', text: line });
      continue;
    }
    // Avant le premier bloc, git décrit le fichier (noms, droits) : la fenêtre le dit déjà.
    if (!rows.length) continue;
    const kind = KINDS[line[0]];
    if (kind) {
      rows.push({ kind, sign: line[0].trim(), text: line.slice(1), ...(kind !== 'add' && { oldNo: oldNo++ }), ...(kind !== 'del' && { newNo: newNo++ }) });
    } else if (line[0] === '\\') {
      rows.push({ kind: 'note', text: t('changes.noNewline') });
    }
  }
  return rows;
}

function cell(className, text = '') {
  const td = document.createElement('td');
  td.className = className;
  // textContent : le contenu d'un fichier n'est jamais lu comme du HTML.
  td.textContent = text;
  return td;
}

/** Construit le tableau d'un correctif. Renvoie null s'il ne contient aucune ligne. */
export function diffTable(patch) {
  const rows = parsePatch(patch);
  if (!rows.length) return null;
  const table = document.createElement('table');
  table.className = 'diff';
  for (const row of rows) {
    const tr = table.insertRow();
    tr.className = row.kind;
    if (row.sign === undefined) {
      const wide = cell('wide', row.text);
      wide.colSpan = 4;
      tr.append(wide);
    } else {
      tr.append(cell('ln', row.oldNo), cell('ln', row.newNo), cell('sign', row.sign), cell('code', row.text));
    }
  }
  return table;
}
