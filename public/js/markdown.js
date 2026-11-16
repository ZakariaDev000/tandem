// Du texte des messages vers du HTML sûr : tout est échappé avant la moindre mise en forme.
// On ne gère que ce que les agents écrivent vraiment : code, gras, listes, citations.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ENTITIES[c]);

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const codeBlock = (source) => '<pre><code>' + escapeHtml(source.replace(/^[a-zA-Z0-9_+-]*\n/, '').replace(/\n$/, '')) + '</code></pre>';

/** Paragraphes, listes et citations d'un passage sans bloc de code. */
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
    for (const line of lines) {
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
  return text
    .split(/```/)
    .map((part, i) => (i % 2 ? codeBlock(part) : prose(part)))
    .join('');
}
