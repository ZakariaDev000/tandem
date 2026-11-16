// Le bureau de Tandem : une petite scène en pixels dessinée à la main dans un canvas.
// Trois personnages : Claude et ChatGPT à leur bureau, Zak sur le tapis.
(function () {
  const W = 256;
  const H = 144;
  const SPEED = 58; // pixels de scène par seconde

  const PAL = {
    claude: { h: '#7a3b1e', s: '#f1c9a5', e: '#2b2420', c: '#d9643a', d: '#b44d28', p: '#4a3b34', b: '#2b2420' },
    chatgpt: { h: '#1d2b2a', s: '#e3b58f', e: '#2b2420', c: '#1f8f7d', d: '#16705f', p: '#3a4652', b: '#2b2420' },
    zak: { h: '#2b2420', s: '#c98f63', e: '#2b2420', c: '#2f4a7a', d: '#233a61', p: '#55606e', b: '#2b2420' },
  };

  const HEAD = {
    claude: ['....hhhh....', '...hhhhhh...', '..hhsssshh..', '...sesses...', '...ssssss...', '....ssss....'],
    chatgpt: ['...hhhhhh...', '..hhhhhhhh..', '..dssssssd..', '..dsessesd..', '...ssssss...', '....ssss....'],
    zak: ['...cccccc...', '..cccccccc..', '..dddddddd..', '...sesses...', '...ssssss...', '....ssss....'],
  };
  const BODY = ['..cccccccc..', '.dccccccccd.', '.dccccccccd.', '.sccccccccs.', '..cccccccc..'];
  const BODY_TYPE = ['..cccccccc..', '.dccccccccd.', '.sccccccccs.', '..cccccccc..', '..cccccccc..'];
  const LEGS = [
    ['...pppppp...', '...pp..pp...', '...pp..pp...', '...pp..pp...', '...bb..bb...'],
    ['...pppppp...', '...pp..pp...', '...pp..pp...', '...pp..bb...', '...bb.......'],
    ['...pppppp...', '...pp..pp...', '...pp..pp...', '...bb..pp...', '.......bb...'],
  ];

  const HOME = { claude: { x: 64, y: 66 }, chatgpt: { x: 192, y: 66 }, zak: { x: 128, y: 128 } };
  const EXIT = { claude: { x: 100, y: 66 }, chatgpt: { x: 156, y: 66 } };
  // Où se placer pour parler à quelqu'un, selon qui vient.
  const MEET = {
    claude: { chatgpt: { x: 152, y: 92 }, zak: { x: 112, y: 126 } },
    chatgpt: { claude: { x: 104, y: 92 }, zak: { x: 144, y: 126 } },
    zak: { claude: { x: 104, y: 96 }, chatgpt: { x: 152, y: 96 }, both: { x: 128, y: 100 } },
  };

  function createOffice(canvas, overlay) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pick = () => {};
    let target = 'both';

    const actors = {};
    for (const id of ['claude', 'chatgpt', 'zak']) {
      const tag = document.createElement('div');
      tag.className = 'tag ' + id;
      tag.textContent = id === 'zak' ? 'Toi' : id === 'claude' ? 'Claude' : 'ChatGPT';
      if (id !== 'zak') tag.addEventListener('click', () => pick(id));
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      overlay.append(bubble, tag);
      actors[id] = {
        id,
        pos: { ...HOME[id] },
        path: [],
        mode: 'home', // home | going | talking | returning
        working: false,
        activity: '',
        say: '',
        lean: '',
        sayUntil: 0,
        step: 0,
        tag,
        bubble,
        shown: '',
      };
    }

    const r = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };

    function sprite(rows, pal, x, y) {
      for (let j = 0; j < rows.length; j++) {
        const row = rows[j];
        for (let i = 0; i < 12; i++) {
          const ch = row[i];
          if (ch === '.') continue;
          ctx.fillStyle = pal[ch];
          ctx.fillRect(x + i, y + j, 1, 1);
        }
      }
    }

    // ---------- Décor ----------

    function background(t) {
      // Mur
      r(0, 0, W, 54, '#efe2c8');
      r(0, 42, W, 10, '#e4d3b2');
      r(0, 41, W, 1, '#d2bf9b');
      r(0, 52, W, 2, '#8a6a4a');
      // Parquet
      r(0, 54, W, H - 54, '#c9a06b');
      for (let y = 54, n = 0; y < H; y += 9, n++) {
        r(0, y, W, 1, '#b58c58');
        for (let x = (n % 2) * 20 - 6; x < W; x += 40) r(x, y + 1, 1, 8, '#b58c58');
      }

      // Fenêtre : le ciel suit l'heure réelle
      const hour = new Date().getHours();
      const sky = hour >= 7 && hour < 17 ? '#9fd3f2' : hour >= 17 && hour < 20 ? '#f2b98a' : '#27304f';
      r(102, 6, 52, 34, '#6b4a2e');
      r(104, 8, 48, 30, sky);
      if (sky === '#27304f') {
        r(140, 12, 4, 4, '#f4eecf');
        for (const [sx, sy] of [[110, 13], [121, 22], [131, 11], [116, 30], [145, 27]]) {
          if (Math.floor(t / 700 + sx) % 5) r(sx, sy, 1, 1, '#f4eecf');
        }
      } else {
        const drift = (t / 900) % 60;
        r(100 + drift, 13, 12, 3, '#ffffff');
        r(103 + drift, 11, 6, 2, '#ffffff');
        r(74 + drift, 25, 10, 3, '#ffffff');
        r(100, 8, 4, 30, '#6b4a2e');
        r(152, 8, 2, 30, '#6b4a2e');
        // Tache de lumière sur le parquet
        ctx.globalAlpha = 0.16;
        for (let i = 0; i < 26; i++) r(100 - i * 0.6, 58 + i, 56, 1, '#fff6d8');
        ctx.globalAlpha = 1;
      }
      r(127, 8, 2, 30, '#6b4a2e');
      r(104, 22, 48, 2, '#6b4a2e');
      r(99, 40, 58, 2, '#8a6a4a');

      // Étagère et livres
      r(18, 26, 46, 2, '#8a6a4a');
      const books = ['#d9643a', '#2f4a7a', '#e7a13a', '#1f8f7d', '#7d5a8c', '#b3372b', '#55606e'];
      let bx = 21;
      books.forEach((c, i) => {
        const bh = 8 + ((i * 3) % 4);
        r(bx, 26 - bh, 4, bh, c);
        r(bx, 26 - bh + 2, 4, 1, '#f6efe2');
        bx += 5;
      });
      r(58, 21, 4, 5, '#b5653a');
      r(57, 17, 6, 4, '#4f9a55');

      // Affiche
      r(196, 9, 30, 26, '#2b2420');
      r(198, 11, 26, 22, '#f6efe2');
      r(203, 16, 9, 12, '#d9643a');
      r(211, 16, 9, 12, '#1f8f7d');

      // Meuble à café
      r(234, 40, 18, 16, '#8a5c30');
      r(234, 40, 18, 2, '#a8743f');
      r(238, 31, 9, 9, '#3b3430');
      r(240, 33, 5, 3, '#6b5d52');
      r(241, 37, 3, 3, '#f6efe2');
      const puff = Math.floor(t / 400) % 3;
      r(242, 34 - puff - 6, 1, 2, '#ffffff');

      // Plantes
      plant(10, 56);
      plant(244, 110);

      // Tapis
      r(98, 116, 60, 22, '#5f7199');
      r(100, 118, 56, 18, '#7d8fb3');
      r(104, 122, 48, 10, '#8fa0c2');
    }

    function plant(x, y) {
      r(x - 4, y + 4, 9, 8, '#b5653a');
      r(x - 5, y + 3, 11, 2, '#c97a4c');
      r(x - 1, y - 6, 3, 10, '#3d8046');
      r(x - 6, y - 4, 5, 3, '#4f9a55');
      r(x + 2, y - 8, 5, 3, '#4f9a55');
      r(x - 4, y - 11, 4, 4, '#62b068');
      r(x + 1, y - 2, 5, 3, '#62b068');
    }

    function desk(id, t) {
      const { x: sx, y: sy } = HOME[id];
      const a = actors[id];
      const left = id === 'claude';
      const accent = PAL[id].c;
      // Plateau et façade
      r(sx - 28, sy - 4, 56, 8, '#a8743f');
      r(sx - 28, sy - 4, 56, 1, '#c08c55');
      r(sx - 26, sy + 4, 52, 12, '#8a5c30');
      r(sx - 26, sy + 4, 52, 1, '#75491f');
      r(sx - 26, sy + 16, 3, 4, '#6f4824');
      r(sx + 23, sy + 16, 3, 4, '#6f4824');
      r(sx - 8, sy + 8, 16, 2, '#75491f');
      // Écran
      const mx = left ? sx - 23 : sx + 9;
      r(mx + 5, sy - 6, 4, 2, '#3b3430');
      r(mx, sy - 17, 14, 11, '#2b2420');
      const lit = a.working && a.mode === 'home';
      r(mx + 1, sy - 16, 12, 9, lit ? '#e8f6ff' : '#4b4640');
      if (lit) {
        const tick = Math.floor(t / 160);
        for (let i = 0; i < 4; i++) {
          const ly = (i * 2 + tick) % 8;
          const lw = 3 + ((i * 5 + tick) % 7);
          r(mx + 2, sy - 15 + ly, lw, 1, i % 2 ? accent : '#6b5d52');
        }
      }
      // Tasse
      const cx = left ? sx + 16 : sx - 20;
      r(cx, sy - 7, 4, 4, accent);
      r(cx + 4, sy - 6, 1, 2, accent);
    }

    function chair(id) {
      const { x: sx, y: sy } = HOME[id];
      r(sx - 6, sy - 13, 12, 10, '#5a4a40');
      r(sx - 5, sy - 12, 10, 8, '#6f5d51');
    }

    function drawActor(a, t) {
      const pal = PAL[a.id];
      const x = Math.round(a.pos.x) - 6;
      const seated = a.id !== 'zak' && a.mode === 'home';
      if (seated) {
        const typing = a.working && Math.floor(t / 180) % 2;
        sprite(HEAD[a.id].concat(typing ? BODY_TYPE : BODY), pal, x, HOME[a.id].y - 15);
        return;
      }
      const moving = a.path.length > 0;
      const frame = moving ? [0, 1, 0, 2][Math.floor(a.step / 5) % 4] : 0;
      const y = Math.round(a.pos.y) - 16;
      // Ombre
      ctx.globalAlpha = 0.18;
      r(x + 2, y + 15, 8, 2, '#000000');
      ctx.globalAlpha = 1;
      sprite(HEAD[a.id].concat(BODY, LEGS[frame]), pal, x, y);
    }

    // ---------- Déplacements ----------

    function route(a, to) {
      const from = a.pos;
      if (EXIT[a.id] && a.mode === 'home') {
        const ex = EXIT[a.id];
        return [{ ...ex }, { x: ex.x, y: to.y }, { ...to }];
      }
      return [{ x: from.x, y: to.y }, { ...to }];
    }

    function routeHome(a) {
      const home = HOME[a.id];
      const ex = EXIT[a.id];
      if (ex) return [{ x: ex.x, y: a.pos.y }, { ...ex }, { ...home }];
      return [{ x: home.x, y: a.pos.y }, { ...home }];
    }

    function goHome(a) {
      if (a.mode === 'home') return;
      a.path = routeHome(a);
      a.mode = 'returning';
      a.say = '';
    }

    function update(a, dt, now) {
      if (a.path.length) {
        let budget = SPEED * dt * (a.working ? 2 : 1);
        if (reduce) budget = Infinity;
        while (a.path.length && budget > 0) {
          const p = a.path[0];
          const dx = p.x - a.pos.x;
          const dy = p.y - a.pos.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= budget) {
            a.pos.x = p.x;
            a.pos.y = p.y;
            a.path.shift();
            budget -= dist;
          } else {
            a.pos.x += (dx / dist) * budget;
            a.pos.y += (dy / dist) * budget;
            budget = 0;
          }
        }
        a.step += dt * 60;
        if (!a.path.length) {
          if (a.mode === 'going') {
            a.mode = 'talking';
            a.sayUntil = now + Math.max(3800, Math.min(9000, a.say.length * 55));
          } else if (a.mode === 'returning') a.mode = 'home';
        }
      } else if (a.mode === 'talking' && now > a.sayUntil) {
        goHome(a);
      }
    }

    function place(a) {
      const seated = a.id !== 'zak' && a.mode === 'home';
      const headY = seated ? HOME[a.id].y - 16 : a.pos.y - 17;
      const left = ((a.pos.x / W) * 100).toFixed(2) + '%';
      const top = ((headY / H) * 100).toFixed(2) + '%';
      a.tag.style.left = left;
      a.tag.style.top = top;
      a.bubble.style.left = `clamp(70px, ${left}, calc(100% - 70px))`;
      a.bubble.style.top = `calc(${top} - 26px)`;

      let text = '';
      let work = false;
      if ((a.mode === 'going' || a.mode === 'talking') && a.say) text = a.say;
      else if (a.working && a.mode === 'home') {
        text = a.activity || 'réfléchit…';
        work = true;
      }
      const key = (work ? 'w:' : 's:' + a.lean + ':') + text;
      if (key !== a.shown) {
        a.shown = key;
        if (text) a.bubble.textContent = text;
        a.bubble.classList.toggle('work', work);
        // La bulle s'étale du côté opposé à celui à qui on parle, pour ne pas le cacher.
        a.bubble.classList.toggle('lean-right', !work && a.lean === 'right');
        a.bubble.classList.toggle('lean-left', !work && a.lean === 'left');
        a.bubble.classList.toggle('show', !!text);
      }
      a.tag.classList.toggle('target', a.id !== 'zak' && (target === a.id || target === 'both'));
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (const a of Object.values(actors)) update(a, dt, now);

      background(now);
      // Du fond vers l'avant : ce qui est plus bas à l'écran passe devant.
      const things = [];
      for (const id of ['claude', 'chatgpt']) {
        things.push({ y: HOME[id].y - 1, draw: () => chair(id) });
        things.push({ y: HOME[id].y + 1, draw: () => desk(id, now) });
      }
      for (const a of Object.values(actors)) things.push({ y: a.pos.y, draw: () => drawActor(a, now) });
      things.sort((p, q) => p.y - q.y);
      for (const th of things) th.draw();
      for (const a of Object.values(actors)) place(a);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // ---------- Clics sur la scène ----------

    function hit(ev) {
      const box = canvas.getBoundingClientRect();
      const x = ((ev.clientX - box.left) / box.width) * W;
      const y = ((ev.clientY - box.top) / box.height) * H;
      for (const id of ['claude', 'chatgpt']) {
        const a = actors[id];
        const h = HOME[id];
        if (Math.abs(x - h.x) < 30 && y > h.y - 20 && y < h.y + 22) return id;
        if (Math.abs(x - a.pos.x) < 8 && y > a.pos.y - 18 && y < a.pos.y + 2) return id;
      }
      return null;
    }
    canvas.addEventListener('mousemove', (ev) => (canvas.style.cursor = hit(ev) ? 'pointer' : 'default'));
    canvas.addEventListener('click', (ev) => {
      const id = hit(ev);
      if (id) pick(id);
    });

    const clip = (s) => {
      s = String(s || '').replace(/```[\s\S]*?```/g, '[code]').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
      return s.length > 150 ? s.slice(0, 149) + '…' : s;
    };

    return {
      onPick(fn) {
        pick = fn;
      },
      setTarget(t) {
        target = t;
      },
      /** Un personnage va porter son message à son destinataire. */
      deliver(from, to, text) {
        const a = actors[from];
        const spot = MEET[from] && MEET[from][to];
        if (!a || !spot) return;
        a.path = route(a, spot);
        a.mode = 'going';
        a.say = clip(text);
        const listener = HOME[to];
        a.lean = !listener || from !== 'zak' && to === 'zak' ? '' : listener.x < spot.x ? 'right' : 'left';
      },
      setWorking(id, working, activity) {
        const a = actors[id];
        if (!a) return;
        if (working && !a.working) a.activity = '';
        a.working = working;
        if (activity !== undefined) a.activity = activity;
        if (working && a.mode !== 'home' && a.mode !== 'returning') goHome(a);
      },
      /** Remet tout le monde à sa place (changement de salon). */
      reset() {
        for (const a of Object.values(actors)) {
          a.pos = { ...HOME[a.id] };
          a.path = [];
          a.mode = 'home';
          a.working = false;
          a.activity = '';
          a.say = '';
        }
      },
    };
  }

  window.createOffice = createOffice;
})();
