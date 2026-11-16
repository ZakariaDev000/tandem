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
fs.mkdirSync(ROOMS_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

const NAME = { zak: 'Zak', claude: 'Claude', chatgpt: 'ChatGPT' };
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
    } catch (e) {
      console.error('Salon illisible :', f, e.message);
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
      ? 'Tu peux lire les fichiers du dossier de travail mais pas les modifier.'
      : 'Tu peux lire et modifier les fichiers du dossier de travail, et rien en dehors.';
  return [
    `Tu es ${NAME[agent]} dans « Tandem », un salon local où tu travailles avec ${NAME[other]} (une autre IA, dans sa propre session) et Zak (l'humain).`,
    `À chaque tour, on te transmet les nouveaux messages du salon. ${NAME[other]} ne voit que ce que tu écris dans ta réponse finale, pas tes outils ni ce que tu as lu : donne-lui les détails utiles.`,
    `Vous partagez le même dossier de travail (${room.cwd}), qui est ton dossier courant : cite les fichiers par leur chemin relatif. ${access}`,
    'Règles du salon :',
    `1. Écris ton message normalement, en français, court et concret.`,
    `2. Termine TOUJOURS par une dernière ligne seule : [[à: ${other}]] si tu attends une réponse ou une action de ${NAME[other]}, ou [[à: zak]] si le travail est fini, si tu as besoin de Zak, ou s'il n'y a plus rien à demander.`,
    `3. Ne relance pas ${NAME[other]} par politesse ou pour confirmer : s'il ne reste rien à faire, adresse-toi à Zak et l'échange s'arrête.`,
  ].join('\n');
}

function toLabel(to, reader) {
  if (to === 'both') return 'à tous';
  if (to === reader) return 'à toi';
  return 'à ' + NAME[to];
}

function buildPrompt(room, agent) {
  const fresh = room.messages
    .slice(room.seen[agent] || 0)
    .filter((m) => m.from !== agent && m.from !== 'system');
  if (!fresh.length) return null;
  const other = OTHER[agent];
  const parts = [];
  if (agent === 'chatgpt' && !room.sessions.chatgpt) parts.push(rules(room, agent), '');
  parts.push('Nouveaux messages du salon :', '');
  for (const m of fresh) parts.push(`### ${NAME[m.from]} (${toLabel(m.to, agent)})`, m.text, '');
  parts.push(
    '---',
    `À toi. Rappel : termine par une dernière ligne seule, [[à: ${other}]] ou [[à: zak]].`
  );
  return parts.join('\n');
}

const ROUTE = /\[\[\s*[àa]\s*:\s*(claude|chatgpt|zak)\s*\]\]/gi;
function parseReply(agent, raw) {
  let to = 'zak';
  let m;
  ROUTE.lastIndex = 0;
  while ((m = ROUTE.exec(raw))) to = m[1].toLowerCase();
  if (to === agent) to = 'zak';
  const text = raw.replace(ROUTE, '').trim();
  return { to, text: text || '(message vide)' };
}

// ---------- Lancement d'un tour ----------

function short(s, n = 70) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
const base = (p) => (p ? path.basename(String(p)) : '');

function describeClaudeTool(name, input = {}) {
  switch (name) {
    case 'Read':
      return 'Lit ' + base(input.file_path);
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return 'Modifie ' + base(input.file_path || input.notebook_path);
    case 'Bash':
      return 'Lance : ' + short(input.description || input.command, 60);
    case 'Grep':
    case 'Glob':
      return 'Cherche ' + short(input.pattern, 50);
    case 'WebSearch':
      return 'Cherche sur le web : ' + short(input.query, 50);
    case 'WebFetch':
      return 'Ouvre ' + short(input.url, 50);
    default:
      return 'Utilise ' + name;
  }
}

function describeCodexItem(item) {
  switch (item.type) {
    case 'command_execution':
      return 'Lance : ' + short(item.command, 60);
    case 'file_change': {
      const files = (item.changes || []).map((c) => base(c.path)).filter(Boolean);
      return 'Modifie ' + (files.slice(0, 3).join(', ') || 'des fichiers');
    }
    case 'web_search':
      return 'Cherche sur le web : ' + short(item.query, 50);
    case 'mcp_tool_call':
      return 'Utilise ' + (item.tool || 'un outil');
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
    if (!bin) return reject(new Error(`${agent === 'claude' ? 'Claude Code' : 'Codex'} est introuvable sur cette machine.`));
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
        } else if (ev.type === 'turn.failed') failure = ev.error?.message || 'le tour a échoué';
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
        return reject(new Error(`Aucune réponse (code ${code ?? signal}). ${short(tail, 300)}`));
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
  try {
    const { text, session } = await runAgent(room, agent, prompt, (a) => {
      if (actions[actions.length - 1] !== a) actions.push(a);
      broadcast('activity', { roomId: room.id, agent, text: a });
    });
    room.sessions[agent] = session;
    room.seen[agent] = upTo;
    const reply = parseReply(agent, text);
    addMessage(room, { from: agent, to: reply.to, text: reply.text, actions });
    if (reply.to === OTHER[agent]) enqueue(room, reply.to, true);
  } catch (e) {
    room.queue = [];
    if (!rooms.has(room.id)) return;
    if (e.stopped) addMessage(room, { from: 'system', kind: 'info', text: `Tu as arrêté ${NAME[agent]}.` });
    else addMessage(room, { from: 'system', kind: 'error', text: `${NAME[agent]} n'a pas pu répondre. ${e.message}` });
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
      if (raw.length > 2e6) reject(new Error('trop long'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON invalide'));
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
  if (!ALLOWED_HOSTS.has(req.headers.host || '')) return send(res, 403, { error: 'Hôte refusé' });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const seg = url.pathname.split('/').filter(Boolean);

  try {
    if (seg[0] === 'api') {
      if (req.method !== 'GET' && req.headers['x-tandem'] !== '1') return send(res, 403, { error: 'Requête refusée' });

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

      if (req.method === 'POST' && seg[1] === 'pick-folder') {
        return execFile(
          'osascript',
          ['-e', 'POSIX path of (choose folder with prompt "Dossier de travail du salon")'],
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
          if (!path.isAbsolute(cwd)) return send(res, 400, { error: 'Donne le chemin complet du dossier.' });
          if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) return send(res, 400, { error: "Ce dossier n'existe pas." });
        } else {
          cwd = path.join(WORK_DIR, id);
          fs.mkdirSync(cwd, { recursive: true });
          ownFolder = true;
        }
        const room = {
          id,
          title: short(body.title, 60) || 'Salon du ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
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
        if (!room) return send(res, 404, { error: 'Salon introuvable' });

        if (req.method === 'POST' && seg[3] === 'messages') {
          const body = await readBody(req);
          const text = String(body.text || '').trim();
          const to = ['both', 'claude', 'chatgpt'].includes(body.to) ? body.to : 'both';
          if (!text) return send(res, 400, { error: 'Message vide' });
          addMessage(room, { from: 'zak', to, text });
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
      return send(res, 404, { error: 'Introuvable' });
    }

    // Fichiers de la page
    if (req.method !== 'GET') return send(res, 405, { error: 'Méthode refusée' });
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Introuvable');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

loadRooms();
server.listen(PORT, HOST, () => {
  console.log(`Tandem est ouvert sur http://localhost:${PORT}`);
  console.log(`Claude Code : ${BIN.claude || 'introuvable'}`);
  console.log(`Codex       : ${BIN.chatgpt || 'introuvable'}`);
});

function shutdown() {
  for (const child of children.values()) child.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
