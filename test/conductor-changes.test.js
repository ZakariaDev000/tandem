// Le chef d'orchestre joint à chaque message les fichiers changés pendant le tour. Les IA sont
// jouées par de petits scripts Node : aucun vrai outil n'est lancé.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { TurnChanges } = require('../src/changes');
const { Conductor } = require('../src/conductor');
const { Snapshots } = require('../src/snapshots');
const { RoomStore } = require('../src/store');

const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-conductor-test-')));
after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

/** Une fausse IA : attend `delayMs`, écrit `file` dans le dossier de travail, puis répond. */
function fakeAgent(id, { file, delayMs = 0, to = 'user' }) {
  const script = `
    process.stdin.resume();
    process.stdin.on('end', () => setTimeout(() => {
      require('node:fs').appendFileSync(${JSON.stringify(file)}, 'written by ${id}\\n');
      console.log(JSON.stringify({ text: 'done [[to: ${to}]]' }));
    }, ${delayMs}));`;
  return {
    id,
    product: id,
    binary: process.execPath,
    rulesInFirstPrompt: false,
    buildArgs: () => ({ args: ['-e', script], session: id + '-session' }),
    readEvent: (event, turn) => (turn.finalText = event.text),
    generatedImagesDir: () => null,
  };
}

let counter = 0;
function setup(agentOptions, changesOverride) {
  const dataDir = path.join(sandbox, 'data-' + counter++);
  const store = new RoomStore({ ROOMS_DIR: path.join(dataDir, 'rooms'), WORKSPACES_DIR: path.join(dataDir, 'workspaces'), MEDIA_DIR: path.join(dataDir, 'media') });
  const agents = new Map(Object.entries(agentOptions).map(([id, options]) => [id, fakeAgent(id, options)]));
  const changes = changesOverride || new TurnChanges({ snapshots: new Snapshots({ dir: path.join(dataDir, 'snapshots') }) });
  // Ces tests ne portent pas sur les fichiers joints ni sur les autorisations : des doublures suffisent.
  const attachments = { dirOf: () => null, readableDirs: () => [], take: () => [] };
  const approvals = { open: () => null, close() {}, answer: () => null };
  const conductor = new Conductor({ store, hub: { broadcast() {} }, agents, changes, attachments, approvals });
  const room = store.create({ title: 'test', cwd: '', access: 'write' });
  return { store, conductor, room, dataDir };
}

async function untilIdle(conductor) {
  while (conductor.isBusy()) await new Promise((resolve) => setTimeout(resolve, 20));
}

const changedBy = (room, agentId) => room.messages.filter((message) => message.from === agentId).map((message) => (message.changes ? message.changes.files.map((file) => file.path) : null));

test('one after the other: each message carries what its own turn changed', async () => {
  const { conductor, room, store, dataDir } = setup({ claude: { file: 'claude.txt' }, chatgpt: { file: 'chatgpt.txt' } });
  fs.writeFileSync(path.join(room.cwd, 'existing.txt'), 'here before the first turn\n');
  conductor.post(room, { to: 'both', text: 'go' });
  await untilIdle(conductor);
  assert.deepEqual(changedBy(room, 'claude'), [['claude.txt']]);
  assert.deepEqual(changedBy(room, 'chatgpt'), [['chatgpt.txt']]);
  const [message] = room.messages.filter((candidate) => candidate.from === 'claude');
  assert.deepEqual(message.changes.files, [{ path: 'claude.txt', status: 'added', added: 1, removed: 0 }]);

  // Le résumé est enregistré avec le salon et se relit après un redémarrage.
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'rooms', room.id + '.json'), 'utf8'));
  assert.deepEqual(saved.messages.find((candidate) => candidate.id === message.id).changes, message.changes);
  // Une modification faite par la personne entre deux tours n'est attribuée à aucune IA.
  fs.writeFileSync(path.join(room.cwd, 'existing.txt'), 'edited by the user between two turns\n');
  conductor.post(room, { to: 'claude', text: 'again' });
  await untilIdle(conductor);
  assert.deepEqual(changedBy(room, 'claude'), [['claude.txt'], ['claude.txt']]);
  assert.deepEqual(room.messages.at(-1).changes.files, [{ path: 'claude.txt', status: 'modified', added: 1, removed: 0 }]);
  assert.ok(store.has(room.id));
});

test('in parallel: each change goes to the first agent that finishes after it', async () => {
  const { conductor, room } = setup({ claude: { file: 'claude.txt', delayMs: 700 }, chatgpt: { file: 'chatgpt.txt' } });
  conductor.post(room, { to: 'both', text: 'go', parallel: true });
  await untilIdle(conductor);
  assert.deepEqual(changedBy(room, 'chatgpt'), [['chatgpt.txt']]);
  assert.deepEqual(changedBy(room, 'claude'), [['claude.txt']]);
});

test('a turn that changes no file has no changes', async () => {
  const { conductor, room } = setup({ claude: { file: path.join(sandbox, 'outside-the-room.txt') }, chatgpt: { file: 'unused.txt' } });
  conductor.post(room, { to: 'claude', text: 'go' });
  await untilIdle(conductor);
  assert.equal(room.messages.at(-1).from, 'claude');
  assert.ok(!('changes' in room.messages.at(-1)));
});

test('stopping while the folder is being recorded stops the agent before it starts', async () => {
  let release;
  const slow = { startStep: () => ({ ready: new Promise((resolve) => (release = resolve)), collect: async () => undefined }) };
  const { conductor, room } = setup({ claude: { file: 'claude.txt' }, chatgpt: { file: 'chatgpt.txt' } }, slow);
  conductor.post(room, { to: 'both', text: 'go' });
  assert.deepEqual(room.running, ['claude']);
  conductor.stop(room);
  assert.equal(room.stopping, true);
  release();
  await untilIdle(conductor);
  assert.deepEqual(room.messages.map((message) => message.code || message.from), ['user', 'stopped']);
  assert.ok(!fs.existsSync(path.join(room.cwd, 'claude.txt')));
  assert.equal(room.stopping, false);
  assert.deepEqual(room.queue, []);
});

test('stopping just after an agent finished does not hand over to the other agent', async () => {
  // Seul le premier relevé de fin de tour traîne : si l'autre IA démarrait quand même, elle finirait son tour.
  let release;
  const slow = { startStep: () => ({ ready: Promise.resolve(), collect: () => (release ? Promise.resolve() : new Promise((resolve) => (release = resolve))) }) };
  const { conductor, room } = setup({ claude: { file: 'claude.txt', to: 'chatgpt' }, chatgpt: { file: 'chatgpt.txt' } }, slow);
  conductor.post(room, { to: 'claude', text: 'go' });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 20));
  conductor.stop(room);
  release();
  await untilIdle(conductor);
  assert.deepEqual(room.messages.map((message) => message.from), ['user', 'claude']);
  assert.ok(!fs.existsSync(path.join(room.cwd, 'chatgpt.txt')));
});
