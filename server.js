#!/usr/bin/env node
// Tandem — salon local où une session Claude Code et une session Codex (ChatGPT)
// se parlent. Aucune dépendance : Node seul. Écoute uniquement sur 127.0.0.1.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3210;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.TANDEM_DATA || path.join(ROOT, 'data');
const ROOMS_DIR = path.join(DATA, 'rooms');
const WORK_DIR = path.join(DATA, 'workspaces');
const MEDIA_DIR = path.join(DATA, 'media');
fs.mkdirSync(ROOMS_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ---------- Images créées pendant un tour ----------

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.venv', 'Pods', 'DerivedData']);

/** Relève les images d'un dossier (chemin relatif -> date de modification). */
function scanImages(dir, depth = 4, out = new Map(), rel = '') {
  if (out.size > 4000) return out;
  let entries;
  try {
    entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (depth > 0 && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) scanImages(dir, depth - 1, out, r);
    } else if (e.isFile() && IMG_EXT.has(path.extname(e.name).toLowerCase())) {
      try {
        const st = fs.statSync(path.join(dir, r));
        out.set(r, st.mtimeMs + ':' + st.size);
      } catch {}
    }
  }
  return out;
}

/**
 * Compare le dossier avant et après un tour, et garde une copie de chaque image
 * nouvelle ou modifiée : le chat montre ainsi chaque version, même si le fichier
 * est remplacé plus tard.
 */
function collectImages(room, agent, before, startedAt, session, msgId) {
  const found = [];
  const after = scanImages(room.cwd);
  for (const [rel, sig] of after) if (before.get(rel) !== sig) found.push({ name: rel, file: path.join(room.cwd, rel) });
  // Codex range d'abord ses images dans son propre dossier : on les reprend s'il ne les a pas copiées.
  if (!found.length && agent === 'chatgpt' && session) {
    const dir = path.join(os.homedir(), '.codex', 'generated_images', session);
    try {
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        if (IMG_EXT.has(path.extname(name).toLowerCase()) && fs.statSync(file).mtimeMs >= startedAt) found.push({ name, file });
      }
    } catch {}
  }
  const images = [];
  const dest = path.join(MEDIA_DIR, room.id);
  for (const img of found.slice(0, 8)) {
    try {
      if (fs.statSync(img.file).size > 25e6) continue;
      fs.mkdirSync(dest, { recursive: true });
      const stored = `${msgId.slice(0, 8)}-${images.length}${path.extname(img.name).toLowerCase()}`;
      fs.copyFileSync(img.file, path.join(dest, stored));
      images.push({ name: img.name, url: `/api/media/${room.id}/${stored}` });
    } catch {}
  }
  return images;
}

const NAME = { user: 'User', claude: 'Claude', chatgpt: 'ChatGPT' };
const OTHER = { claude: 'chatgpt', chatgpt: 'claude' };

// ---------- Localisation des deux outils ----------

function findBin(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).concat([
    path.join(os.homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]);
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, name);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {}
  }
  return null;
}
const BIN = { claude: findBin('claude'), chatgpt: findBin('codex') };

// ---------- Salons ----------

/** @type {Map<string, any>} */
const rooms = new Map();
/** Processus en cours par salon (non enregistré sur disque). */
const children = new Map();

function loadRooms() {
  for (const f of fs.readdirSync(ROOMS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, f), 'utf8'));
      r.running = null;
      r.queue = [];
      r.paused = false;
      rooms.set(r.id, r);
      // Les premiers salons appelaient l'humain « zak » : on passe à l'identifiant neutre « user ».
      let migrated = false;
      for (const m of r.messages) {
        if (m.from === 'zak') (m.from = 'user'), (migrated = true);
        if (m.to === 'zak') (m.to = 'user'), (migrated = true);
      }
      if (migrated) saveRoom(r);
      // Un salon sans projet range ses fichiers dans le dossier de données de l'appli.
      // Si l'appli a été déplacée, on la suit : le chemin enregistré n'est plus bon, et
      // les sessions des IA étaient liées à l'ancien dossier. Chaque IA repart donc sur
      // une session neuve et reçoit toute la conversation à son prochain tour.
      if (r.ownFolder) {
        const here = path.join(WORK_DIR, r.id);
        if (r.cwd !== here) {
          r.cwd = here;
          r.sessions = { claude: null, chatgpt: null };
          r.seen = { claude: 0, chatgpt: 0 };
          fs.mkdirSync(here, { recursive: true });
          saveRoom(r);
        }
      }
    } catch (e) {
      console.error('Unreadable room file:', f, e.message);
    }
  }
}

function saveRoom(room) {
  // Un salon supprimé pendant qu'une IA travaillait ne doit pas réapparaître.
  if (!rooms.has(room.id)) return;
  const { running, queue, paused, stopping, ...keep } = room;
  const file = path.join(ROOMS_DIR, room.id + '.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(keep, null, 1));
  fs.renameSync(file + '.tmp', file);
}

function publicRoom(room) {
  return {
    id: room.id,
    title: room.title,
    cwd: room.cwd,
    ownFolder: room.ownFolder,
    access: room.access,
    createdAt: room.createdAt,
    messages: room.messages,
    running: room.running,
    queue: room.queue,
    paused: room.paused,
    stopping: !!room.stopping,
  };
}

function roomMeta(room) {
  const { messages, ...meta } = publicRoom(room);
  return meta;
}

// ---------- Diffusion en direct (Server-Sent Events) ----------

const clients = new Set();
function broadcast(event, data) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(chunk);
}

function addMessage(room, msg) {
  const message = { id: crypto.randomUUID(), ts: Date.now(), ...msg };
  room.messages.push(message);
  saveRoom(room);
  broadcast('message', { roomId: room.id, message });
  return message;
}

// ---------- Consignes données aux deux IA ----------

function rules(room, agent) {
  const other = OTHER[agent];
  const access =
    room.access === 'read'
      ? 'You may read the files in the working folder but not change them.'
      : 'You may read and change the files in the working folder, and nothing outside it.';
  return [
    `You are ${NAME[agent]} in "Tandem", a local room where you work with ${NAME[other]} (another AI, in its own session) and the user (a human).`,
    `Each turn you receive the new messages from the room. ${NAME[other]} only sees what you write in your final reply, not your tools or what you read, so include the details it needs.`,
    `You both share the same working folder (${room.cwd}), which is your current directory: refer to files by their relative path. ${access}`,
    'Room rules:',
    `1. Write your message normally, short and concrete, in the language the user writes in.`,
    `2. ALWAYS end with a final line on its own: [[to: ${other}]] if you expect a reply or an action from ${NAME[other]}, or [[to: user]] if the work is done, if you need the user, or if there is nothing left to ask.`,
    `3. Do not message ${NAME[other]} out of politeness or just to confirm: if nothing is left to do, address the user and the exchange stops.`,
    agent === 'chatgpt'
      ? `4. You can generate images with your built-in tool. When asked for one, create it, save it in the working folder and mention its file name: the room shows it to the user automatically.`
      : `4. ChatGPT can generate images (logo, banner, illustration): ask it when one is needed. You can then open the file to look at it and ask for changes. Images created in the working folder are shown to the user automatically.`,
  ].join('\n');
}

function toLabel(to, reader) {
  if (to === 'both') return 'to everyone';
  if (to === reader) return 'to you';
  return 'to ' + NAME[to];
}

function buildPrompt(room, agent) {
  const fresh = room.messages
    .slice(room.seen[agent] || 0)
    .filter((m) => m.from !== agent && m.from !== 'system');
  if (!fresh.length) return null;
  const other = OTHER[agent];
  const parts = [];
  if (agent === 'chatgpt' && !room.sessions.chatgpt) parts.push(rules(room, agent), '');
  parts.push('New messages in the room:', '');
  for (const m of fresh) parts.push(`### ${NAME[m.from]} (${toLabel(m.to, agent)})`, m.text, '');
  parts.push(
    '---',
    `Your turn. Reminder: end with a final line on its own, [[to: ${other}]] or [[to: user]].`
  );
  return parts.join('\n');
}

// « à » et « zak » restent acceptés : ce sont les balises des premières versions.
const ROUTE = /\[\[\s*(?:to|à|a)\s*:\s*(claude|chatgpt|user|zak)\s*\]\]/gi;
function parseReply(agent, raw) {
  let to = 'user';
  let m;
  ROUTE.lastIndex = 0;
  while ((m = ROUTE.exec(raw))) to = m[1].toLowerCase();
  if (to === agent || to === 'zak') to = 'user';
  const text = raw.replace(ROUTE, '').trim();
  return { to, text: text || '(empty message)' };
}

// ---------- Lancement d'un tour ----------

function short(s, n = 70) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
const base = (p) => (p ? path.basename(String(p)) : '');

// Chaque action est décrite par un verbe et une cible : c'est la page qui la met en mots,
// dans la langue de la personne qui regarde.
function describeClaudeTool(name, input = {}) {
  switch (name) {
    case 'Read':
      return { verb: 'read', target: base(input.file_path) };
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return { verb: 'edit', target: base(input.file_path || input.notebook_path) };
    case 'Bash':
      return { verb: 'run', target: short(input.description || input.command, 60) };
    case 'Grep':
    case 'Glob':
      return { verb: 'search', target: short(input.pattern, 50) };
    case 'WebSearch':
      return { verb: 'web', target: short(input.query, 50) };
    case 'WebFetch':
      return { verb: 'open', target: short(input.url, 50) };
    default:
      return { verb: 'tool', target: name };
  }
}

function describeCodexItem(item) {
  switch (item.type) {
    case 'command_execution': {
      // Codex enveloppe chaque commande dans « /bin/zsh -lc '…' » : on ne garde que la commande.
      const cmd = String(item.command || '').replace(/^\S*\/(?:zsh|bash|sh)\s+-l?c\s+/, '').replace(/^(['"])([\s\S]*)\1$/, '$2');
      return { verb: 'run', target: short(cmd, 60) };
    }
    case 'file_change': {
      const files = (item.changes || []).map((c) => base(c.path)).filter(Boolean);
      return { verb: 'edit', target: files.slice(0, 3).join(', ') };
    }
    case 'web_search':
      return { verb: 'web', target: short(item.query, 50) };
    case 'mcp_tool_call':
      return { verb: 'tool', target: item.tool || 'MCP' };
    default:
      return null;
  }
}

/** Lit un flux ligne par ligne et appelle onLine pour chaque ligne JSON. */
function readJsonLines(stream, onLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        onLine(JSON.parse(line));
      } catch {}
    }
  });
}

function runAgent(room, agent, prompt, onActivity) {
  return new Promise((resolve, reject) => {
    const bin = BIN[agent];
    if (!bin) return reject(new Error(`${agent === 'claude' ? 'Claude Code' : 'Codex'} was not found on this machine.`));
    const session = room.sessions[agent];
    let args;
    let newSession = session;

    if (agent === 'claude') {
      args = ['-p', '--output-format', 'stream-json', '--verbose', '--append-system-prompt', rules(room, agent)];
      if (room.access === 'read') args.push('--disallowedTools', 'Edit', 'Write', 'NotebookEdit', 'Bash');
      else args.push('--permission-mode', 'acceptEdits');
      if (session) args.push('--resume', session);
      else {
        newSession = crypto.randomUUID();
        args.push('--session-id', newSession);
      }
    } else {
      const sandbox = room.access === 'read' ? 'read-only' : 'workspace-write';
      if (session) args = ['exec', 'resume', session, '--json', '--skip-git-repo-check', '-c', `sandbox_mode="${sandbox}"`, '-'];
      else args = ['exec', '--json', '--skip-git-repo-check', '-s', sandbox, '-C', room.cwd, '-'];
    }

    const child = spawn(bin, args, { cwd: room.cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    children.set(room.id, child);

    let finalText = null;
    let lastText = null;
    let failure = null;
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));

    readJsonLines(child.stdout, (ev) => {
      if (agent === 'claude') {
        if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) newSession = ev.session_id;
        else if (ev.type === 'assistant') {
          for (const b of ev.message?.content || []) {
            if (b.type === 'tool_use') onActivity(describeClaudeTool(b.name, b.input));
            else if (b.type === 'text' && b.text.trim()) lastText = b.text;
          }
        } else if (ev.type === 'result') {
          if (ev.is_error || ev.subtype !== 'success') failure = ev.result || ev.subtype || 'erreur inconnue';
          else finalText = ev.result;
        }
      } else {
        if (ev.type === 'thread.started' && ev.thread_id) newSession = ev.thread_id;
        else if (ev.type === 'item.started' || ev.type === 'item.completed') {
          const item = ev.item || {};
          if (item.type === 'agent_message') {
            if (ev.type === 'item.completed' && item.text) lastText = item.text;
          } else if (ev.type === 'item.started' || item.type === 'file_change') {
            const d = describeCodexItem(item);
            if (d) onActivity(d);
          }
        } else if (ev.type === 'turn.failed') failure = ev.error?.message || 'the turn failed';
        else if (ev.type === 'error') failure = ev.message || 'erreur';
      }
    });

    child.on('error', (e) => {
      children.delete(room.id);
      reject(e);
    });
    child.on('close', (code, signal) => {
      children.delete(room.id);
      if (child.stoppedByUser) return reject(Object.assign(new Error('stopped'), { stopped: true }));
      const text = finalText ?? lastText;
      if (failure && !text) return reject(new Error(short(failure, 400)));
      if (!text) {
        const tail = stderr.trim().split('\n').slice(-3).join(' ');
        return reject(new Error(`No reply (exit ${code ?? signal}). ${short(tail, 300)}`));
      }
      resolve({ text, session: newSession });
    });

    child.stdin.end(prompt);
  });
}

function enqueue(room, agent, front = false) {
  room.queue = room.queue.filter((a) => a !== agent);
  if (front) room.queue.unshift(agent);
  else room.queue.push(agent);
}

async function pump(room) {
  if (room.running || room.paused) return;
  const agent = room.queue.shift();
  if (!agent) {
    broadcast('room', roomMeta(room));
    return;
  }
  const upTo = room.messages.length;
  const prompt = buildPrompt(room, agent);
  if (!prompt) return pump(room);

  room.running = agent;
  broadcast('room', roomMeta(room));
  const actions = [];
  const imagesBefore = scanImages(room.cwd);
  const startedAt = Date.now();
  try {
    const { text, session } = await runAgent(room, agent, prompt, (a) => {
      const last = actions[actions.length - 1];
      if (!last || last.verb !== a.verb || last.target !== a.target) actions.push(a);
      broadcast('activity', { roomId: room.id, agent, action: a });
    });
    room.sessions[agent] = session;
    room.seen[agent] = upTo;
    const reply = parseReply(agent, text);
    const id = crypto.randomUUID();
    const images = collectImages(room, agent, imagesBefore, startedAt, session, id);
    addMessage(room, { id, from: agent, to: reply.to, text: reply.text, actions, images });
    if (reply.to === OTHER[agent]) enqueue(room, reply.to, true);
  } catch (e) {
    room.queue = [];
    if (!rooms.has(room.id)) return;
    if (e.stopped) addMessage(room, { from: 'system', kind: 'info', code: 'stopped', agent });
    else addMessage(room, { from: 'system', kind: 'error', code: 'failed', agent, detail: e.message });
  }
  room.running = null;
  room.stopping = false;
  saveRoom(room);
  broadcast('room', roomMeta(room));
  pump(room);
}

// ---------- Serveur HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (d) => {
      raw += d;
      if (raw.length > 2e6) reject(new Error('Request body too large.'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function expandHome(p) {
  p = String(p || '').trim();
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const server = http.createServer(async (req, res) => {
  // Protection : la page n'est servie qu'à cette machine, et les actions exigent
  // un en-tête qu'un autre site ouvert dans le navigateur ne peut pas envoyer.
  if (!ALLOWED_HOSTS.has(req.headers.host || '')) return send(res, 403, { error: 'host_refused', message: 'Host not allowed.' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const seg = url.pathname.split('/').filter(Boolean);

  try {
    if (seg[0] === 'api') {
      if (req.method !== 'GET' && req.headers['x-tandem'] !== '1') return send(res, 403, { error: 'forbidden', message: 'Request refused.' });

      if (req.method === 'GET' && seg[1] === 'events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        res.write(`event: hello\ndata: ${JSON.stringify({
          rooms: [...rooms.values()].map(publicRoom),
          agents: { claude: !!BIN.claude, chatgpt: !!BIN.chatgpt },
        })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }

      if (req.method === 'GET' && seg[1] === 'media' && seg.length === 4) {
        const file = path.join(MEDIA_DIR, path.basename(seg[2]), path.basename(decodeURIComponent(seg[3])));
        const type = MIME[path.extname(file)];
        if (!type || !type.startsWith('image/') || !fs.existsSync(file)) return send(res, 404, { error: 'image_not_found', message: 'Image not found.' });
        // « sandbox » empêche un fichier SVG ouvert seul d'exécuter du code sur cette page.
        res.writeHead(200, {
          'Content-Type': type,
          'Cache-Control': 'private, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        });
        return fs.createReadStream(file).pipe(res);
      }

      if (req.method === 'POST' && seg[1] === 'pick-folder') {
        // Le titre de la fenêtre vient de la page, dans la langue de la personne. On n'y garde
        // que des lettres, chiffres et espaces, car il est placé dans une commande AppleScript.
        const body = await readBody(req);
        const prompt = String(body.prompt || '').replace(/[^\p{L}\p{N} ,.'’-]/gu, '').replace(/'/g, '’').slice(0, 80) || 'Working folder';
        return execFile(
          'osascript',
          ['-e', `POSIX path of (choose folder with prompt "${prompt}")`],
          { timeout: 120000 },
          (err, stdout) => send(res, 200, { path: err ? null : stdout.trim().replace(/\/$/, '') })
        );
      }

      if (seg[1] === 'rooms' && seg.length === 2 && req.method === 'POST') {
        const body = await readBody(req);
        const id = crypto.randomUUID().slice(0, 8);
        let cwd = expandHome(body.cwd);
        let ownFolder = false;
        if (cwd) {
          if (!path.isAbsolute(cwd)) return send(res, 400, { error: 'folder_relative', message: 'Give the full path of the folder.' });
          if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) return send(res, 400, { error: 'folder_missing', message: 'This folder does not exist.' });
        } else {
          cwd = path.join(WORK_DIR, id);
          fs.mkdirSync(cwd, { recursive: true });
          ownFolder = true;
        }
        const room = {
          id,
          title: short(body.title, 60) || 'Untitled room',
          cwd,
          ownFolder,
          access: body.access === 'read' ? 'read' : 'write',
          createdAt: Date.now(),
          messages: [],
          sessions: { claude: null, chatgpt: null },
          seen: { claude: 0, chatgpt: 0 },
          running: null,
          queue: [],
          paused: false,
        };
        rooms.set(id, room);
        saveRoom(room);
        broadcast('room-created', publicRoom(room));
        return send(res, 200, publicRoom(room));
      }

      if (seg[1] === 'rooms' && seg[2]) {
        const room = rooms.get(seg[2]);
        if (!room) return send(res, 404, { error: 'room_not_found', message: 'Room not found.' });

        if (req.method === 'POST' && seg[3] === 'messages') {
          const body = await readBody(req);
          const text = String(body.text || '').trim();
          const to = ['both', 'claude', 'chatgpt'].includes(body.to) ? body.to : 'both';
          if (!text) return send(res, 400, { error: 'empty_message', message: 'The message is empty.' });
          addMessage(room, { from: 'user', to, text });
          if (to === 'both') {
            enqueue(room, 'claude');
            enqueue(room, 'chatgpt');
          } else enqueue(room, to);
          broadcast('room', roomMeta(room));
          pump(room);
          return send(res, 200, { ok: true });
        }

        if (req.method === 'POST' && seg[3] === 'pause') {
          const body = await readBody(req);
          room.paused = !!body.paused;
          broadcast('room', roomMeta(room));
          pump(room);
          return send(res, 200, { ok: true });
        }

        if (req.method === 'POST' && seg[3] === 'stop') {
          room.queue = [];
          room.paused = false;
          const child = children.get(room.id);
          if (child) {
            // L'outil met quelques secondes à se fermer proprement : on le signale à la page.
            room.stopping = true;
            child.stoppedByUser = true;
            child.kill('SIGTERM');
          }
          broadcast('room', roomMeta(room));
          return send(res, 200, { ok: true });
        }

        if (req.method === 'DELETE' && seg.length === 3) {
          const child = children.get(room.id);
          if (child) {
            child.stoppedByUser = true;
            child.kill('SIGTERM');
          }
          rooms.delete(room.id);
          fs.rmSync(path.join(ROOMS_DIR, room.id + '.json'), { force: true });
          fs.rmSync(path.join(MEDIA_DIR, room.id), { recursive: true, force: true });
          // Le dossier créé pour un salon sans projet n'est retiré que s'il est vide.
          if (room.ownFolder) {
            try {
              fs.rmdirSync(room.cwd);
            } catch {}
          }
          broadcast('room-deleted', { id: room.id });
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: 'not_found', message: 'Not found.' });
    }

    // Fichiers de la page
    if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed', message: 'Method not allowed.' });
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: 'server_error', message: e.message });
  }
});

loadRooms();
server.listen(PORT, HOST, () => {
  console.log(`Tandem is running at http://localhost:${PORT}`);
  console.log(`Claude Code : ${BIN.claude || 'not found'}`);
  console.log(`Codex       : ${BIN.chatgpt || 'not found'}`);
});

function shutdown() {
  for (const child of children.values()) child.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
