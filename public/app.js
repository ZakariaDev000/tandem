// Tandem — le chat et le lien avec le serveur local.
(function () {
  const $ = (id) => document.getElementById(id);
  const NAME = { zak: 'Toi', claude: 'Claude', chatgpt: 'ChatGPT' };
  const INITIAL = { zak: 'Z', claude: 'C', chatgpt: 'G' };

  const office = window.createOffice($('scene'), $('overlay'));
  const rooms = new Map();
  let currentId = null;
  let target = 'both';
  const live = {}; // dernière action en cours, par salon

  const remember = (id) => {
    try {
      localStorage.setItem('tandem.room', id || '');
    } catch {}
  };
  const recall = () => {
    try {
      return localStorage.getItem('tandem.room');
    } catch {
      return null;
    }
  };

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Tandem': '1' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'La demande a échoué.');
    return data;
  }

  // ---------- Texte des messages ----------

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function render(text) {
    const out = [];
    const parts = text.split(/```/);
    parts.forEach((part, i) => {
      if (i % 2) {
        out.push('<pre><code>' + esc(part.replace(/^[a-zA-Z0-9_+-]*\n/, '').replace(/\n$/, '')) + '</code></pre>');
        return;
      }
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
    });
    return out.join('');
  }

  const toLabel = (m) => {
    if (m.from === 'zak') return m.to === 'both' ? 'aux deux' : 'à ' + NAME[m.to];
    return m.to === 'zak' ? 'à toi' : 'à ' + NAME[m.to];
  };
  const clock = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function messageEl(m) {
    const el = document.createElement('div');
    if (m.from === 'system') {
      el.className = 'sys' + (m.kind === 'error' ? ' error' : '');
      el.textContent = m.text;
      return el;
    }
    el.className = 'msg';
    const acts = m.actions && m.actions.length
      ? `<details class="actions-done"><summary>${m.actions.length} action${m.actions.length > 1 ? 's' : ''}</summary><ul>${m.actions.map((a) => '<li>' + esc(a) + '</li>').join('')}</ul></details>`
      : '';
    el.innerHTML = `<div class="avatar ${m.from}" aria-hidden="true">${INITIAL[m.from]}</div>
      <div class="body">
        <div class="who">${NAME[m.from]} <span class="to">→ ${toLabel(m)}</span><time>${clock(m.ts)}</time></div>
        <div class="text">${render(m.text)}</div>${acts}
      </div>`;
    return el;
  }

  // ---------- Affichage ----------

  function busy(room) {
    return !!room.running || room.queue.length > 0;
  }

  function renderRooms() {
    const nav = $('rooms');
    nav.textContent = '';
    const list = [...rooms.values()].sort((a, b) => b.createdAt - a.createdAt);
    for (const room of list) {
      const b = document.createElement('button');
      b.setAttribute('aria-current', room.id === currentId ? 'true' : 'false');
      const dot = document.createElement('span');
      dot.className = 'dot' + (room.running ? ' on' : '');
      b.append(dot, room.title);
      b.addEventListener('click', () => select(room.id));
      nav.append(b);
    }
    const none = rooms.size === 0;
    $('app').hidden = none;
    $('empty').hidden = !none;
  }

  function renderHead() {
    const room = rooms.get(currentId);
    if (!room) return;
    $('room-title').textContent = room.title;
    const tail = room.cwd.split('/').filter(Boolean).slice(-2).join('/');
    $('room-cwd').textContent = room.ownFolder ? 'Simple discussion, sans dossier' : '…/' + tail + (room.access === 'read' ? ' · lecture seule' : '');
    $('room-cwd').title = room.cwd;
    const st = $('status');
    const last = room.messages[room.messages.length - 1];
    st.className = 'status';
    if (room.stopping) st.textContent = 'Arrêt en cours…';
    else if (room.running) {
      st.textContent = NAME[room.running] + ' travaille…';
      st.classList.add(room.running);
    } else if (room.paused && room.queue.length) st.textContent = 'En pause';
    else if (last && last.from !== 'zak' && last.from !== 'system' && last.to === 'zak') {
      st.textContent = 'Échange terminé';
      st.classList.add('done');
    } else st.textContent = room.messages.length ? 'En attente' : 'Prêt';
    $('pause').hidden = !busy(room) || room.stopping;
    $('pause').textContent = room.paused ? 'Reprendre' : 'Pause';
    $('stop').hidden = !busy(room) || room.stopping;
  }

  function renderLive() {
    const room = rooms.get(currentId);
    const thread = $('thread');
    let row = thread.querySelector('.live');
    if (!room || !room.running) {
      if (row) row.remove();
      return;
    }
    if (!row) {
      row = document.createElement('div');
      row.className = 'live';
      row.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>';
    }
    thread.append(row);
    row.lastChild.textContent = NAME[room.running] + ' : ' + (live[room.id] || 'réfléchit…');
  }

  function scrollDown() {
    const t = $('thread');
    t.scrollTop = t.scrollHeight;
  }

  function renderThread() {
    const room = rooms.get(currentId);
    const thread = $('thread');
    thread.textContent = '';
    if (!room) return;
    if (!room.messages.length) {
      const e = document.createElement('p');
      e.className = 'thread-empty';
      e.textContent = 'Écris ta demande ci-dessous. Claude et ChatGPT se répartissent le travail et te préviennent quand ils ont fini.';
      thread.append(e);
    }
    for (const m of room.messages) thread.append(messageEl(m));
    renderLive();
    scrollDown();
  }

  function syncOffice() {
    const room = rooms.get(currentId);
    for (const id of ['claude', 'chatgpt']) {
      const on = !!room && room.running === id;
      office.setWorking(id, on, on ? live[room.id] || '' : '');
    }
  }

  function select(id) {
    if (!rooms.has(id)) id = null;
    currentId = id;
    remember(id);
    office.reset();
    renderRooms();
    renderHead();
    renderThread();
    syncOffice();
    if (id) $('input').focus();
  }

  function setTarget(t) {
    target = t;
    for (const b of document.querySelectorAll('.targets button')) b.setAttribute('aria-checked', String(b.dataset.to === t));
    office.setTarget(t);
  }

  // ---------- Événements du serveur ----------

  function connect() {
    const es = new EventSource('/api/events');
    es.addEventListener('hello', (e) => {
      const data = JSON.parse(e.data);
      rooms.clear();
      for (const r of data.rooms) rooms.set(r.id, r);
      const wanted = currentId || recall();
      const first = [...rooms.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
      select(rooms.has(wanted) ? wanted : first ? first.id : null);
    });
    es.addEventListener('room-created', (e) => {
      const r = JSON.parse(e.data);
      if (!rooms.has(r.id)) rooms.set(r.id, r);
      if (!currentId) select(r.id);
      else renderRooms();
    });
    es.addEventListener('room-deleted', (e) => {
      const { id } = JSON.parse(e.data);
      rooms.delete(id);
      if (id === currentId) {
        const first = [...rooms.values()].sort((a, b) => b.createdAt - a.createdAt)[0];
        select(first ? first.id : null);
      } else renderRooms();
    });
    es.addEventListener('room', (e) => {
      const meta = JSON.parse(e.data);
      const room = rooms.get(meta.id);
      if (!room) return;
      const was = room.running;
      Object.assign(room, meta);
      if (was !== room.running) live[room.id] = '';
      renderRooms();
      if (room.id === currentId) {
        renderHead();
        renderLive();
        syncOffice();
        scrollDown();
      }
    });
    es.addEventListener('message', (e) => {
      const { roomId, message } = JSON.parse(e.data);
      const room = rooms.get(roomId);
      if (!room) return;
      room.messages.push(message);
      if (roomId !== currentId) return;
      const thread = $('thread');
      const empty = thread.querySelector('.thread-empty');
      if (empty) empty.remove();
      thread.append(messageEl(message));
      renderLive();
      renderHead();
      scrollDown();
      if (message.from !== 'system') office.deliver(message.from, message.to, message.text);
    });
    es.addEventListener('activity', (e) => {
      const { roomId, agent, text } = JSON.parse(e.data);
      live[roomId] = text;
      if (roomId !== currentId) return;
      office.setWorking(agent, true, text);
      renderLive();
    });
  }

  // ---------- Actions ----------

  $('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('input');
    const text = input.value.trim();
    if (!text || !currentId) return;
    input.value = '';
    autosize();
    try {
      await api('POST', `/api/rooms/${currentId}/messages`, { to: target, text });
    } catch (err) {
      input.value = text;
      alert(err.message);
    }
  });

  function autosize() {
    const input = $('input');
    input.style.height = 'auto';
    input.style.height = Math.min(160, input.scrollHeight + 4) + 'px';
  }
  $('input').addEventListener('input', autosize);
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('composer').requestSubmit();
    }
  });

  for (const b of document.querySelectorAll('.targets button')) b.addEventListener('click', () => setTarget(b.dataset.to));
  office.onPick((id) => {
    setTarget(target === id ? 'both' : id);
    $('input').focus();
  });

  $('pause').addEventListener('click', () => {
    const room = rooms.get(currentId);
    if (room) api('POST', `/api/rooms/${room.id}/pause`, { paused: !room.paused }).catch((e) => alert(e.message));
  });
  $('stop').addEventListener('click', () => {
    if (currentId) api('POST', `/api/rooms/${currentId}/stop`).catch((e) => alert(e.message));
  });
  $('delete').addEventListener('click', () => {
    const room = rooms.get(currentId);
    if (!room) return;
    const note = room.ownFolder ? '' : '\nLe dossier de travail et ses fichiers ne sont pas touchés.';
    if (confirm(`Supprimer le salon « ${room.title} » et sa conversation ?${note}`)) {
      api('DELETE', `/api/rooms/${room.id}`).catch((e) => alert(e.message));
    }
  });

  // Fenêtre « Nouveau salon »
  const dialog = $('dialog');
  function openDialog() {
    $('room-form').reset();
    $('f-error').hidden = true;
    dialog.showModal();
    $('f-title').focus();
  }
  $('new-room').addEventListener('click', openDialog);
  $('empty-new').addEventListener('click', openDialog);
  $('f-cancel').addEventListener('click', () => dialog.close());
  $('f-pick').addEventListener('click', async () => {
    try {
      const { path } = await api('POST', '/api/pick-folder');
      if (path) $('f-cwd').value = path;
    } catch {}
  });
  $('room-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const room = await api('POST', '/api/rooms', {
        title: $('f-title').value,
        cwd: $('f-cwd').value,
        access: new FormData($('room-form')).get('access'),
      });
      rooms.set(room.id, room);
      dialog.close();
      select(room.id);
    } catch (err) {
      $('f-error').textContent = err.message;
      $('f-error').hidden = false;
    }
  });

  setTarget('both');
  connect();
})();
