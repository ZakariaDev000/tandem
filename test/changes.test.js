// Les relevés et les changements d'un tour, essayés sur de vrais dossiers créés dans le dossier
// temporaire du système. Lancer avec : node --test test/
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');
const { TurnChanges } = require('../src/changes');
const { Snapshots } = require('../src/snapshots');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tandem-changes-test-'));
after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

let counter = 0;
const freshDir = (name) => {
  const dir = path.join(sandbox, `${name}-${counter++}`);
  fs.mkdirSync(dir, { recursive: true });
  // Le dossier temporaire de macOS est un lien : git et Node doivent parler du même chemin.
  return fs.realpathSync(dir);
};

function write(dir, relative, content) {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Lance git dans le dépôt de la personne, sans dépendre des réglages de la machine. */
function userGit(cwd, ...args) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, env, encoding: 'utf8' });
}

/** Empreinte d'un dossier : le nom, le type et le contenu de tout ce qu'il contient. */
function fingerprint(dir) {
  const hash = crypto.createHash('sha256');
  const visit = (relative) => {
    for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const entryPath = path.join(relative, entry.name);
      hash.update(entryPath + '\0');
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isSymbolicLink()) hash.update(fs.readlinkSync(path.join(dir, entryPath)));
      else hash.update(fs.readFileSync(path.join(dir, entryPath)));
    }
  };
  visit('');
  return hash.digest('hex');
}

function setup(options = {}) {
  const dataDir = freshDir('data');
  const snapshots = new Snapshots({ dir: dataDir, ...options });
  return { dataDir, snapshots, changes: new TurnChanges({ snapshots }) };
}

/** Joue un tour : relevé, modifications, puis résumé rangé dans un message du salon. */
async function turn(changes, room, edit) {
  const step = changes.startStep(room);
  await step.ready;
  await edit();
  const summary = await step.collect();
  const message = { id: crypto.randomUUID(), from: 'claude', ...(summary && { changes: summary }) };
  room.messages.push(message);
  return message;
}

const byPath = (summary) => Object.fromEntries(summary.files.map((file) => [file.path, file]));
const detail = (changes, room, message, filePath) => changes.fileOf(room, message.id, String(message.changes.files.findIndex((file) => file.path === filePath)));

test('a plain folder: every kind of change is reported with its lines', async () => {
  const { changes, dataDir } = setup();
  const cwd = freshDir('plain');
  const room = { id: 'plain', cwd, messages: [] };
  write(cwd, 'keep.txt', 'one\ntwo\nthree\n');
  write(cwd, 'gone.txt', 'bye\n');
  write(cwd, 'old name.txt', 'a\nb\nc\nd\ne\nf\n');
  write(cwd, 'swap', 'a file that becomes a folder\n');
  write(cwd, 'folder/inner.txt', 'a folder that becomes a file\n');
  write(cwd, 'script.sh', 'echo hi\n');
  write(cwd, 'node_modules/pkg/index.js', 'ignored by default\n');
  write(cwd, '.gitignore', 'secret.env\nlogs/\n');
  write(cwd, 'secret.env', 'TOKEN=before\n');
  write(cwd, 'long.txt', Array.from({ length: 20000 }, (_, i) => `line ${i}`).join('\n') + '\n');

  const message = await turn(changes, room, () => {
    write(cwd, 'keep.txt', 'one\n2\nthree\nfour\n \n');
    write(cwd, 'new/created.txt', 'hello\nworld\n');
    fs.rmSync(path.join(cwd, 'gone.txt'));
    fs.renameSync(path.join(cwd, 'old name.txt'), path.join(cwd, 'new *name?.txt'));
    fs.rmSync(path.join(cwd, 'swap'));
    write(cwd, 'swap/child.txt', 'child\n');
    fs.rmSync(path.join(cwd, 'folder'), { recursive: true });
    write(cwd, 'folder', 'now a file\n');
    fs.chmodSync(path.join(cwd, 'script.sh'), 0o755);
    write(cwd, 'image.bin', Buffer.from([0, 1, 2, 3, 0, 255, 254]));
    write(cwd, 'huge.bin', Buffer.alloc(3e6, 7));
    write(cwd, 'node_modules/pkg/index.js', 'still ignored\n');
    write(cwd, 'secret.env', 'TOKEN=after\n');
    write(cwd, 'logs/run.log', 'ignored by the project\n');
    write(cwd, 'long.txt', Array.from({ length: 20000 }, (_, i) => `changed line ${i}`).join('\n') + '\n');
    fs.symlinkSync('keep.txt', path.join(cwd, 'link'));
  });

  const summary = message.changes;
  assert.match(summary.from, /^[0-9a-f]{40}$/);
  assert.match(summary.to, /^[0-9a-f]{40}$/);
  assert.notEqual(summary.from, summary.to);
  const files = byPath(summary);
  assert.deepEqual(Object.keys(files).sort(), ['folder', 'folder/inner.txt', 'gone.txt', 'image.bin', 'keep.txt', 'link', 'long.txt', 'new *name?.txt', 'new/created.txt', 'script.sh', 'swap', 'swap/child.txt']);
  assert.deepEqual(files['keep.txt'], { path: 'keep.txt', status: 'modified', added: 3, removed: 1 });
  assert.deepEqual(files['new/created.txt'], { path: 'new/created.txt', status: 'added', added: 2, removed: 0 });
  assert.deepEqual(files['gone.txt'], { path: 'gone.txt', status: 'deleted', added: 0, removed: 1 });
  assert.deepEqual(files['new *name?.txt'], { path: 'new *name?.txt', status: 'renamed', from: 'old name.txt', added: 0, removed: 0 });
  assert.deepEqual(files['image.bin'], { path: 'image.bin', status: 'added', binary: true });
  assert.deepEqual(files['script.sh'], { path: 'script.sh', status: 'modified', added: 0, removed: 0 });
  assert.equal(files.swap.status, 'deleted');
  assert.equal(files['swap/child.txt'].status, 'added');
  assert.equal(files.folder.status, 'added');
  assert.equal(files['folder/inner.txt'].status, 'deleted');
  assert.equal(summary.count, 12);
  assert.equal(summary.truncated, undefined);
  assert.equal(summary.added, summary.files.reduce((sum, file) => sum + (file.added || 0), 0));
  assert.equal(summary.removed, summary.files.reduce((sum, file) => sum + (file.removed || 0), 0));

  // Le correctif d'un fichier modifié, à la ligne près, y compris une ligne faite d'un seul espace.
  const kept = await detail(changes, room, message, 'keep.txt');
  assert.equal(kept.kind, 'text');
  assert.equal(kept.patch.slice(kept.patch.indexOf('@@')), '@@ -1,3 +1,5 @@\n one\n-two\n+2\n three\n+four\n+ \n');
  const created = await detail(changes, room, message, 'new/created.txt');
  assert.ok(created.patch.endsWith('@@ -0,0 +1,2 @@\n+hello\n+world\n'));
  const deleted = await detail(changes, room, message, 'gone.txt');
  assert.ok(deleted.patch.endsWith('@@ -1 +0,0 @@\n-bye\n'));
  // Un renommage sans changement n'a aucune ligne à montrer, et un nom plein de jokers ne vise que lui.
  const renamed = await detail(changes, room, message, 'new *name?.txt');
  assert.match(renamed.patch, /rename from old name\.txt\nrename to new \*name\?\.txt\n$/);
  assert.ok(!renamed.patch.includes('@@'));
  // Un fichier devenu dossier : son correctif ne contient pas les fichiers du dossier.
  const swapped = await detail(changes, room, message, 'swap');
  assert.equal(swapped.patch.match(/^diff --git/gm).length, 1);
  assert.ok(swapped.patch.endsWith('-a file that becomes a folder\n'));

  assert.deepEqual(await detail(changes, room, message, 'image.bin'), { kind: 'binary' });
  assert.deepEqual(await detail(changes, room, message, 'long.txt'), { kind: 'too_large' });

  // Ce que la page pourrait envoyer de faux.
  await assert.rejects(changes.fileOf(room, 'unknown-message', '0'), { status: 404, code: 'message_not_found' });
  for (const index of ['12', '99', '-1', '1.5', 'abc', '', '../0', '0/../../etc/passwd', '__proto__', 'length']) {
    await assert.rejects(changes.fileOf(room, message.id, index), { status: 404, code: 'change_not_found' }, `index ${index}`);
  }
  // Un salon dont le fichier aurait été modifié à la main ne fait pas passer d'option à git.
  room.messages.push({ id: 'tampered', changes: { ...summary, from: '--output=/tmp/x' } });
  await assert.rejects(changes.fileOf(room, 'tampered', '0'), { status: 404, code: 'change_not_found' });
  room.messages.push({ id: 'no-changes' });
  await assert.rejects(changes.fileOf(room, 'no-changes', '0'), { status: 404, code: 'change_not_found' });

  // Rien n'a été écrit dans le dossier de travail, et le relevé disparaît avec le salon.
  assert.ok(!fs.existsSync(path.join(cwd, '.git')));
  assert.ok(fs.existsSync(path.join(dataDir, 'plain.git', 'HEAD')));
  await changes.forget(room);
  assert.ok(!fs.existsSync(path.join(dataDir, 'plain.git')));
  await assert.rejects(detail(changes, room, message, 'keep.txt'), { status: 500, code: 'changes_unavailable' });
});

test('a turn that changes nothing, or only ignored and oversized files, reports nothing', async () => {
  const { changes } = setup();
  const cwd = freshDir('quiet');
  const room = { id: 'quiet', cwd, messages: [] };
  write(cwd, 'a.txt', 'a\n');
  write(cwd, '.gitignore', '*.log\n');
  assert.equal((await turn(changes, room, () => {})).changes, undefined);
  const message = await turn(changes, room, () => {
    write(cwd, 'debug.log', 'ignored\n');
    write(cwd, 'dist/bundle.js', 'build output\n');
    write(cwd, 'video.mov', Buffer.alloc(2e6 + 1));
    fs.utimesSync(path.join(cwd, 'a.txt'), new Date(), new Date(Date.now() + 5000));
  });
  assert.equal(message.changes, undefined);
});

test('more than 50 files: the list is capped, the totals are not', async () => {
  const { changes } = setup();
  const cwd = freshDir('many');
  const room = { id: 'many', cwd, messages: [] };
  const message = await turn(changes, room, () => {
    for (let i = 0; i < 73; i++) write(cwd, `file-${String(i).padStart(2, '0')}.txt`, 'x\ny\n');
  });
  assert.equal(message.changes.files.length, 50);
  assert.equal(message.changes.count, 73);
  assert.equal(message.changes.truncated, true);
  assert.equal(message.changes.added, 146);
  await assert.rejects(changes.fileOf(room, message.id, '50'), { code: 'change_not_found' });
});

test('two agents in one step: a change goes to the first one that finishes', async () => {
  const { changes } = setup();
  const cwd = freshDir('parallel');
  const room = { id: 'parallel', cwd, messages: [] };
  write(cwd, 'shared.txt', 'start\n');
  const step = changes.startStep(room);
  await step.ready;
  write(cwd, 'first.txt', 'written before the first agent finished\n');
  const first = await step.collect();
  write(cwd, 'second.txt', 'written after the first agent finished\n');
  const second = await step.collect();
  assert.deepEqual(first.files.map((file) => file.path), ['first.txt']);
  assert.deepEqual(second.files.map((file) => file.path), ['second.txt']);
  assert.equal(first.to, second.from);

  // Deux IA qui finissent au même instant : rien n'est compté deux fois.
  write(cwd, 'third.txt', 'written before both finished\n');
  const [third, fourth] = await Promise.all([step.collect(), step.collect()]);
  assert.deepEqual(third.files.map((file) => file.path), ['third.txt']);
  assert.equal(fourth, undefined);
});

test("the person's git repository is left untouched", async () => {
  const { changes } = setup();
  const cwd = freshDir('repo');
  const room = { id: 'repo', cwd, messages: [] };
  write(cwd, '.gitignore', 'ignored/\n');
  write(cwd, 'tracked.txt', 'committed\n');
  write(cwd, 'staged.txt', 'committed\n');
  write(cwd, 'src/app.js', 'const a = 1;\n');
  userGit(cwd, 'init', '--quiet', '-b', 'main');
  userGit(cwd, 'add', '-A');
  userGit(cwd, 'commit', '--quiet', '-m', 'first');
  // Du travail en cours : une modification indexée, une autre non, un fichier jamais suivi.
  write(cwd, 'staged.txt', 'committed\nstaged but not committed\n');
  userGit(cwd, 'add', 'staged.txt');
  write(cwd, 'tracked.txt', 'committed\nmodified, not staged\n');
  write(cwd, 'untracked.txt', 'never added\n');
  write(cwd, 'ignored/cache.txt', 'ignored by the project\n');

  const state = () => ({
    status: userGit(cwd, 'status', '--porcelain=v2', '--branch', '--untracked-files=all'),
    head: userGit(cwd, 'rev-parse', 'HEAD'),
    staged: userGit(cwd, 'diff', '--cached'),
    stash: userGit(cwd, 'stash', 'list'),
    refs: userGit(cwd, 'for-each-ref'),
  });
  const before = state();
  // L'empreinte est prise après « git status », qui peut lui-même rafraîchir l'index.
  const gitDirBefore = fingerprint(path.join(cwd, '.git'));
  const workBefore = fingerprint(cwd);

  // Un tour sans modification : ni le dépôt ni les fichiers ne bougent d'un octet.
  assert.equal((await turn(changes, room, () => {})).changes, undefined);
  assert.equal(fingerprint(cwd), workBefore);

  const message = await turn(changes, room, () => {
    write(cwd, 'src/app.js', 'const a = 2;\n');
    write(cwd, 'untracked.txt', 'never added\nedited by the agent\n');
    write(cwd, 'ignored/cache.txt', 'still ignored\n');
    fs.rmSync(path.join(cwd, 'tracked.txt'));
  });
  await detail(changes, room, message, 'src/app.js');
  assert.equal(fingerprint(path.join(cwd, '.git')), gitDirBefore);

  // Seul ce que l'IA a fait pendant le tour est rapporté, pas le travail en cours d'avant.
  assert.deepEqual(byPath(message.changes), {
    'src/app.js': { path: 'src/app.js', status: 'modified', added: 1, removed: 1 },
    'tracked.txt': { path: 'tracked.txt', status: 'deleted', added: 0, removed: 2 },
    'untracked.txt': { path: 'untracked.txt', status: 'modified', added: 1, removed: 0 },
  });

  // Une fois les fichiers remis comme avant le tour, git décrit exactement le même dépôt.
  write(cwd, 'src/app.js', 'const a = 1;\n');
  write(cwd, 'untracked.txt', 'never added\n');
  write(cwd, 'tracked.txt', 'committed\nmodified, not staged\n');
  assert.deepEqual(state(), before);
});

test('a subfolder of a git repository: the parent repository is left untouched', async () => {
  const { changes } = setup();
  const repo = freshDir('monorepo');
  const cwd = path.join(repo, 'packages', 'app');
  const room = { id: 'nested', cwd, messages: [] };
  write(repo, 'README.md', 'root\n');
  write(cwd, 'index.js', 'module.exports = 1;\n');
  write(cwd, '.gitignore', 'local-only/\n');
  write(cwd, 'local-only/notes.txt', 'ignored by the subfolder\n');
  userGit(repo, 'init', '--quiet', '-b', 'main');
  userGit(repo, 'add', '-A');
  userGit(repo, 'commit', '--quiet', '-m', 'first');
  write(cwd, 'draft.js', '// untracked work in progress\n');
  // Un dépôt imbriqué, et un autre encore vide : leur contenu n'est pas relevé.
  write(cwd, 'vendor/lib/lib.js', 'nested repository\n');
  userGit(path.join(cwd, 'vendor/lib'), 'init', '--quiet');
  userGit(path.join(cwd, 'vendor/lib'), 'add', '-A');
  userGit(path.join(cwd, 'vendor/lib'), 'commit', '--quiet', '-m', 'nested');
  fs.mkdirSync(path.join(cwd, 'vendor/empty'), { recursive: true });
  userGit(path.join(cwd, 'vendor/empty'), 'init', '--quiet');

  const status = () => userGit(repo, 'status', '--porcelain=v2', '--branch', '--untracked-files=all') + userGit(repo, 'rev-parse', 'HEAD');
  const before = status();
  const gitDirBefore = fingerprint(path.join(repo, '.git'));
  const nestedBefore = fingerprint(path.join(cwd, 'vendor'));

  const message = await turn(changes, room, () => {
    write(cwd, 'index.js', 'module.exports = 2;\n');
    write(cwd, 'draft.js', '// untracked work in progress\n// continued\n');
    write(cwd, 'local-only/notes.txt', 'still ignored\n');
    write(cwd, 'vendor/lib/lib.js', 'changed inside the nested repository\n');
    write(repo, 'README.md', 'changed outside the working folder\n');
  });
  assert.deepEqual(Object.keys(byPath(message.changes)).sort(), ['draft.js', 'index.js']);
  assert.ok((await detail(changes, room, message, 'index.js')).patch.endsWith('-module.exports = 1;\n+module.exports = 2;\n'));

  assert.equal(fingerprint(path.join(repo, '.git')), gitDirBefore);
  assert.ok(!fs.existsSync(path.join(cwd, '.git')));
  write(cwd, 'vendor/lib/lib.js', 'nested repository\n');
  assert.equal(fingerprint(path.join(cwd, 'vendor')), nestedBefore);
  write(cwd, 'index.js', 'module.exports = 1;\n');
  write(cwd, 'draft.js', '// untracked work in progress\n');
  write(repo, 'README.md', 'root\n');
  assert.equal(status(), before);
});

test('an unreadable file does not break the snapshot', { skip: process.getuid && process.getuid() === 0 }, async () => {
  const { changes } = setup();
  const cwd = freshDir('unreadable');
  const room = { id: 'unreadable', cwd, messages: [] };
  write(cwd, 'fine.txt', 'fine\n');
  write(cwd, 'locked.txt', 'nobody can read this\n');
  fs.chmodSync(path.join(cwd, 'locked.txt'), 0o000);
  try {
    const message = await turn(changes, room, () => write(cwd, 'fine.txt', 'fine\nedited\n'));
    assert.deepEqual(message.changes.files.map((file) => file.path), ['fine.txt']);
  } finally {
    fs.chmodSync(path.join(cwd, 'locked.txt'), 0o644);
  }
});

test('a lock left by a crash does not block the next snapshot', async () => {
  const { changes, dataDir } = setup();
  const cwd = freshDir('locked');
  const room = { id: 'locked', cwd, messages: [] };
  write(cwd, 'a.txt', 'a\n');
  await turn(changes, room, () => {});
  fs.writeFileSync(path.join(dataDir, 'locked.git', 'index.lock'), '');
  const message = await turn(changes, room, () => write(cwd, 'a.txt', 'b\n'));
  assert.equal(message.changes.count, 1);
});

test('a snapshot that takes too long is not waited for, and later turns recover', async () => {
  const { snapshots } = setup({ timeBoxMs: 0 });
  const cwd = freshDir('slow');
  write(cwd, 'a.txt', 'a\n');
  assert.equal(await snapshots.take('slow', cwd), null);
  // Tant que le relevé en retard n'est pas fini, on ne se met pas à la file derrière lui.
  assert.equal(await snapshots.take('slow', cwd), null);
  // « remove » passe après le relevé en cours : quand il répond, plus rien ne tourne.
  await snapshots.remove('slow');
  const patient = setup();
  assert.match(await patient.snapshots.take('slow', cwd), /^[0-9a-f]{40}$/);
});

test('without git, a turn simply has no changes', async () => {
  const { changes } = setup();
  const cwd = freshDir('no-git');
  const room = { id: 'no-git', cwd, messages: [] };
  const originalPath = process.env.PATH;
  const originalError = console.error;
  process.env.PATH = path.join(sandbox, 'nowhere');
  console.error = () => {};
  try {
    const message = await turn(changes, room, () => write(cwd, 'a.txt', 'a\n'));
    assert.equal(message.changes, undefined);
  } finally {
    process.env.PATH = originalPath;
    console.error = originalError;
  }
});
