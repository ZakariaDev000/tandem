// Les relevés d'un dossier de travail : une photo de ses fichiers à un instant donné.
// Ils sont pris avec git, dans un dépôt à part rangé avec les données de l'appli : le dépôt
// de la personne (index, branche, commits) n'est jamais touché, et un dossier sans git convient aussi.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { git } = require('./git');

// Écartés même si le projet ne les ignore pas : dossiers lourds, régénérés par un outil.
const DEFAULT_EXCLUDES = [
  'node_modules/',
  '.venv/',
  'venv/',
  '__pycache__/',
  '.pytest_cache/',
  '.mypy_cache/',
  '.ruff_cache/',
  '.tox/',
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  '.turbo/',
  '.parcel-cache/',
  '.cache/',
  '.gradle/',
  '.expo/',
  'dist/',
  'build/',
  'out/',
  'target/',
  'coverage/',
  'Pods/',
  'DerivedData/',
  '.DS_Store',
];
// Au-delà, un fichier reste hors du relevé : le copier ralentirait les tours et gonflerait les données.
const MAX_FILE_BYTES = 2e6;
// Temps laissé à un relevé. Passé ce délai, le tour continue sans lui.
const TIME_BOX_MS = 4000;
// Un relevé en retard se termine en arrière-plan, mais pas indéfiniment.
const GIT_TIMEOUT_MS = 120000;
// Une liste de fichiers : celle d'un gros dossier dépasse de loin la limite de sortie par défaut,
// et un nom de fichier peut commencer ou finir par un espace, d'où la sortie gardée telle quelle.
const LISTING = { maxBuffer: 256e6, raw: true };
// Les fichiers sont examinés par paquets, pour ne pas en ouvrir des dizaines de milliers à la fois.
const STAT_BATCH = 256;

const STATUSES = { A: 'added', D: 'deleted', R: 'renamed' };

const nulSeparated = (names) => names.join('\0') + '\0';

const canRead = (file) => fs.promises.access(file, fs.constants.R_OK).then(() => true, () => false);

/**
 * Trie les chemins que git signale comme nouveaux, modifiés ou disparus : ceux à relever et
 * ceux à retirer. Le tri se fait ici parce que git rejette la liste entière au premier chemin
 * qu'il ne peut pas traiter : un fichier devenu dossier, un fichier illisible.
 */
async function sortChanged(workDir, names) {
  const kept = [];
  const gone = [];
  const sortOne = async (name) => {
    const file = path.join(workDir, name);
    const stat = await fs.promises.lstat(file).catch(() => null);
    if (!stat || !(stat.isFile() || stat.isSymbolicLink())) gone.push(name);
    else if (stat.size <= MAX_FILE_BYTES && (stat.isSymbolicLink() || (await canRead(file)))) kept.push(name);
  };
  for (let i = 0; i < names.length; i += STAT_BATCH) await Promise.all(names.slice(i, i + STAT_BATCH).map(sortOne));
  return { kept, gone };
}

/** Lit la sortie de « diff-tree --raw --numstat -z » : d'abord l'état de chaque fichier, puis ses lignes. */
function parseChanges(output) {
  const tokens = output.split('\0');
  const files = new Map();
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i++];
    if (!token) continue;
    if (token.startsWith(':')) {
      const code = token.split(' ')[4][0];
      // Un renommage tient sur deux chemins : l'ancien, puis le nouveau.
      const from = code === 'R' || code === 'C' ? tokens[i++] : undefined;
      const file = { path: tokens[i++], status: STATUSES[code] || 'modified', ...(from && { from }) };
      files.set(file.path, file);
      continue;
    }
    const [added, removed, ...rest] = token.split('\t');
    let name = rest.join('\t');
    if (!name) {
      i++;
      name = tokens[i++];
    }
    const file = files.get(name);
    if (!file) continue;
    // Pour un fichier binaire, git ne compte pas de lignes.
    if (added === '-') file.binary = true;
    else Object.assign(file, { added: Number(added), removed: Number(removed) });
  }
  return [...files.values()];
}

class Snapshots {
  #dir;
  #timeBoxMs;
  #queues = new Map(); // salon -> dernier travail lancé sur son dépôt
  #late = new Set(); // salons dont un relevé a dépassé le délai et se termine en arrière-plan

  constructor({ dir, timeBoxMs = TIME_BOX_MS }) {
    this.#dir = dir;
    this.#timeBoxMs = timeBoxMs;
  }

  /**
   * Relève le dossier d'un salon et renvoie l'identifiant du relevé. Renvoie null s'il échoue ou
   * tarde trop : un relevé ne doit jamais faire échouer ni ralentir un tour.
   */
  take(roomId, workDir) {
    // Le premier relevé d'un très gros dossier peut être long. Il se termine alors en arrière-plan,
    // et les tours suivants s'en passent plutôt que d'attendre derrière lui.
    if (this.#late.has(roomId)) return Promise.resolve(null);
    const job = this.#inTurn(roomId, () => this.#snapshot(roomId, workDir)).catch((error) => {
      console.error('Snapshot failed:', String(error.message).split('\n')[0]);
      return null;
    });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#late.add(roomId);
        resolve(null);
      }, this.#timeBoxMs);
      job.then((tree) => {
        clearTimeout(timer);
        this.#late.delete(roomId);
        resolve(tree);
      });
    });
  }

  /** Les fichiers qui diffèrent entre deux relevés : chemin, état, lignes ajoutées et retirées. */
  async compare(roomId, from, to) {
    return parseChanges(await this.#git(roomId, ['diff-tree', '-r', '-z', '-M', '--raw', '--numstat', from, to], LISTING));
  }

  /**
   * Le correctif d'un fichier entre deux relevés, ou null s'il dépasse `maxBytes`.
   * `paths` donne son chemin, précédé de l'ancien s'il a été renommé.
   */
  async patch(roomId, from, to, paths, maxBytes) {
    // Chaque chemin est pris au pied de la lettre, sans les fichiers d'un dossier qui porterait son nom.
    const exact = paths.flatMap((file) => [`:(literal)${file}`, `:(exclude,literal)${file}/`]);
    const args = ['diff-tree', '-p', '-M', '--no-color', '--no-ext-diff', '--no-textconv', from, to, '--', ...exact];
    try {
      return await this.#git(roomId, args, { maxBuffer: maxBytes, raw: true });
    } catch (error) {
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return null;
      throw error;
    }
  }

  /** Supprime les relevés d'un salon. */
  remove(roomId) {
    // Après le relevé en cours : sinon git recréerait des fichiers dans le dossier supprimé.
    return this.#inTurn(roomId, () => fs.promises.rm(this.#repoOf(roomId), { recursive: true, force: true })).catch(() => {});
  }

  #repoOf(roomId) {
    return path.join(this.#dir, roomId + '.git');
  }

  /** Un seul travail à la fois par dépôt : deux commandes git ne peuvent pas écrire le même index. */
  #inTurn(roomId, task) {
    const run = (this.#queues.get(roomId) || Promise.resolve()).then(task, task);
    this.#queues.set(roomId, run.catch(() => {}));
    return run;
  }

  #git(roomId, args, { workDir, ...options } = {}) {
    const repo = this.#repoOf(roomId);
    const env = {
      GIT_DIR: repo,
      ...(workDir && { GIT_WORK_TREE: workDir }),
      // Les réglages git de la personne (filtres, fins de ligne, surveillance des fichiers) ne
      // doivent ni changer le contenu relevé ni lancer d'autres programmes.
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_CONFIG_NOSYSTEM: '1',
    };
    return git(args, workDir || repo, { timeout: GIT_TIMEOUT_MS, ...options, env });
  }

  async #snapshot(roomId, workDir) {
    const repo = this.#repoOf(roomId);
    const run = (args, options) => this.#git(roomId, args, { workDir, ...options });
    if (!fs.existsSync(path.join(repo, 'HEAD'))) {
      fs.mkdirSync(repo, { recursive: true });
      // Sans modèle : les exemples de scripts que git copie d'habitude ne servent à rien ici.
      await run(['init', '--quiet', '--template=']);
    }
    fs.mkdirSync(path.join(repo, 'info'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'info', 'exclude'), DEFAULT_EXCLUDES.join('\n') + '\n');
    // Seul ce module écrit dans ce dépôt, un travail à la fois : un verrou encore là date d'un arrêt brutal.
    fs.rmSync(path.join(repo, 'index.lock'), { force: true });

    // Les fichiers ignorés par le projet (.gitignore) sont écartés par git lui-même.
    const listing = await run(['ls-files', '-z', '--others', '--modified', '--deleted', '--exclude-standard'], LISTING);
    // Un nom terminé par « / » est un dépôt git imbriqué : son contenu n'est pas relevé.
    const changed = [...new Set(listing.split('\0'))].filter((name) => name && !name.endsWith('/'));
    const { kept, gone } = await sortChanged(workDir, changed);
    if (gone.length) await run(['update-index', '-z', '--force-remove', '--stdin'], { input: nulSeparated(gone) });
    if (kept.length) await run(['update-index', '-z', '--add', '--remove', '--replace', '--stdin'], { input: nulSeparated(kept) });
    return run(['write-tree']);
  }
}

module.exports = { Snapshots };
