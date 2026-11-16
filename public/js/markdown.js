// Du texte des messages vers du HTML sûr. Rien de ce texte n'est recopié tel quel : chaque
// morceau est échappé au moment où il est écrit, et seules les adresses http(s) deviennent des liens.
// On ne gère que ce que les agents écrivent vraiment : code, gras, liens, listes, citations, tableaux.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

// ---------- Liens ----------

// Une adresse s'arrête au premier espace, guillemet ou chevron.
const URL_CHARS = '[^\\s<>"\'`\\\\\\u0000-\\u001f]+';
const WHOLE_URL = new RegExp(`^https?://${URL_CHARS}$`, 'i');
const URL_AT = new RegExp(`https?://${URL_CHARS}`, 'iy');
// La ponctuation qui suit une adresse dans une phrase n'en fait pas partie.
const TRAILING = '.,;:!?*_~…»”’';
const OPENING = { ')': '(', ']': '[', '}': '{' };
// Au-delà, ce n'est plus un lien : cette limite évite aussi de relire tout le texte à chaque crochet.
const MAX_LINK_LENGTH = 2000;

const count = (text, char) => text.split(char).length - 1;

/** Seules les adresses http et https deviennent cliquables : jamais « javascript: » ni un autre schéma. */
function isSafeUrl(url) {
  if (!WHOLE_URL.test(url)) return false;
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

const link = (url, labelHtml) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;

/** Retire la ponctuation finale d'une adresse. Une parenthèse fermante reste si elle en ferme une de l'adresse. */
function trimUrl(url) {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    const kept = url.slice(0, end);
    if (TRAILING.includes(last) || (OPENING[last] && count(kept, last) > count(kept, OPENING[last]))) end--;
    else break;
  }
  return url.slice(0, end);
}

/** L'adresse écrite telle quelle à cet endroit du texte, ou null. */
function readUrl(source, at) {
  URL_AT.lastIndex = at;
  const found = URL_AT.exec(source);
  const url = found && trimUrl(found[0]);
  return url && isSafeUrl(url) ? url : null;
}

/** Le lien [texte](adresse) qui commence à cet endroit : { label, url, end }, ou null. */
function readLink(source, at) {
  const limit = Math.min(source.length, at + MAX_LINK_LENGTH);
  let depth = 0;
  let i = at;
  for (; i < limit; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === '[') depth++;
    else if (source[i] === ']' && --depth === 0) break;
  }
  if (i >= limit || source[i + 1] !== '(') return null;
  let parens = 0;
  let j = i + 1;
  for (; j < limit; j++) {
    if (source[j] === '(') parens++;
    else if (source[j] === ')' && --parens === 0) break;
  }
  if (j >= limit) return null;
  return { label: source.slice(at + 1, i), url: source.slice(i + 2, j), end: j + 1 };
}

// ---------- Mise en forme dans une ligne ----------

/** Le passage de code qui commence à cet endroit : { text, end }, ou null s'il n'est pas refermé. */
function readCode(source, at) {
  let ticks = 0;
  while (source[at + ticks] === '`') ticks++;
  const fence = '`'.repeat(ticks);
  for (let from = at + ticks; ; ) {
    const close = source.indexOf(fence, from);
    if (close === -1) return null;
    let run = ticks;
    while (source[close + run] === '`') run++;
    if (run === ticks) return close > at + ticks ? { text: source.slice(at + ticks, close), end: close + ticks } : null;
    from = close + run;
  }
}

/** Où se referme le gras ouvert juste avant `from`, sans compter ce qui est dans du code. -1 s'il ne se referme pas. */
function findBoldEnd(source, from) {
  for (let i = from; i < source.length; i++) {
    if (source[i] === '`') {
      const code = readCode(source, i);
      if (code) i = code.end - 1;
    } else if (source[i] === '*' && source[i + 1] === '*') return i;
  }
  return -1;
}

/** Met en forme une ligne. Le texte d'un lien ne contient pas lui-même de lien. */
function inline(source, allowLinks = true) {
  let html = '';
  let plain = ''; // texte lu mais pas encore écrit
  const write = (piece) => {
    html += escapeHtml(plain) + piece;
    plain = '';
  };
  for (let i = 0; i < source.length; ) {
    const char = source[i];
    if (char === '`') {
      const code = readCode(source, i);
      if (code) {
        write('<code>' + escapeHtml(code.text) + '</code>');
        i = code.end;
        continue;
      }
    } else if (char === '*' && source[i + 1] === '*') {
      const end = findBoldEnd(source, i + 2);
      if (end > i + 2) {
        write('<strong>' + inline(source.slice(i + 2, end), allowLinks) + '</strong>');
        i = end + 2;
        continue;
      }
    } else if (allowLinks && char === '[') {
      const found = readLink(source, i);
      if (found && isSafeUrl(found.url)) {
        write(link(found.url, found.label.trim() ? inline(found.label, false) : escapeHtml(found.url)));
        i = found.end;
        continue;
      }
    } else if (allowLinks && (char === 'h' || char === 'H') && !/\w/.test(source[i - 1] || '')) {
      const url = readUrl(source, i);
      if (url) {
        write(link(url, escapeHtml(url)));
        i += url.length;
        continue;
      }
    }
    plain += char;
    i++;
  }
  return html + escapeHtml(plain);
}

// ---------- Tableaux ----------

const ALIGNMENTS = [
  [/^:-+:$/, 'center'],
  [/^-+:$/, 'right'],
  [/^:-+$/, 'left'],
];

/** Découpe une ligne de tableau en cellules. Une barre échappée ou écrite dans du code ne sépare rien. */
function splitRow(line) {
  const row = line.trim();
  const cells = [];
  let cell = '';
  for (let i = 0; i < row.length; i++) {
    const code = row[i] === '`' && readCode(row, i);
    if (code) {
      cell += row.slice(i, code.end).replaceAll('\\|', '|');
      i = code.end - 1;
    } else if (row[i] === '\\' && row[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (row[i] === '|') {
      cells.push(cell);
      cell = '';
    } else cell += row[i];
  }
  // La barre qui ouvre ou ferme la ligne ne crée pas de cellule vide.
  if (cell.trim() || !cells.length) cells.push(cell);
  if (row.startsWith('|')) cells.shift();
  return cells.map((text) => text.trim());
}

/**
 * Le tableau qui commence à cette ligne : une ligne d'en-tête, puis une ligne de tirets avec
 * autant de colonnes. Renvoie { html, lineCount }, ou null.
 */
function readTable(lines, at) {
  const rule = lines[at + 1];
  if (rule === undefined || !lines[at].includes('|') || !rule.includes('|')) return null;
  const head = splitRow(lines[at]);
  const marks = splitRow(rule);
  if (!head.length || marks.length !== head.length || !marks.every((mark) => /^:?-+:?$/.test(mark))) return null;

  const aligns = marks.map((mark) => (ALIGNMENTS.find(([pattern]) => pattern.test(mark)) || [])[1]);
  const cell = (tag, text, column) => `<${tag}${aligns[column] ? ` style="text-align:${aligns[column]}"` : ''}>${inline(text || '')}</${tag}>`;
  // Chaque ligne a autant de cellules que l'en-tête : ce qui manque est vide, ce qui dépasse est ignoré.
  const row = (tag, cells) => '<tr>' + head.map((_, column) => cell(tag, cells[column], column)).join('') + '</tr>';

  let next = at + 2;
  const body = [];
  while (next < lines.length && lines[next].includes('|')) body.push(row('td', splitRow(lines[next++])));
  const html = `<div class="table-wrap"><table><thead>${row('th', head)}</thead><tbody>${body.join('')}</tbody></table></div>`;
  return { html, lineCount: next - at };
}

// ---------- Blocs ----------

const codeBlock = (source) => '<pre><code>' + escapeHtml(source.replace(/^[a-zA-Z0-9_+-]*\n/, '').replace(/\n$/, '')) + '</code></pre>';

/** Paragraphes, listes, citations et tableaux d'un passage sans bloc de code. */
function prose(part) {
  const out = [];
  let list = null;
  const flush = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((x) => '<li>' + x + '</li>').join('')}</${list.tag}>`);
    list = null;
  };
  for (const block of part.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    let para = [];
    const endPara = () => {
      if (para.length) out.push('<p>' + para.join('<br>') + '</p>');
      para = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const table = readTable(lines, i);
      if (table) {
        endPara();
        flush();
        out.push(table.html);
        i += table.lineCount - 1;
        continue;
      }
      const m = line.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
      if (m) {
        endPara();
        const tag = m[1] ? 'ul' : 'ol';
        if (!list || list.tag !== tag) {
          flush();
          list = { tag, items: [] };
        }
        list.items.push(inline(m[3]));
      } else {
        flush();
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) para.push('<span class="quote">' + inline(quote[1]) + '</span>');
        else para.push(inline(line.replace(/^#{1,6}\s+/, '')));
      }
    }
    endPara();
    flush();
  }
  return out.join('');
}

export function renderMarkdown(text) {
  // Un passage sur deux, entre les ```, est un bloc de code.
  return String(text ?? '')
    .split(/```/)
    .map((part, i) => (i % 2 ? codeBlock(part) : prose(part)))
    .join('');
}
