// Les mises à jour : Tandem s'installe par « git clone », donc se mettre à jour revient à
// récupérer les nouveaux commits de la branche principale, puis à relancer l'appli.
const fs = require('node:fs');
const { git } = require('./git');

const BRANCH = 'main';
const REMOTE = 'origin';
const UPSTREAM = `${REMOTE}/${BRANCH}`;
const FIRST_CHECK_DELAY_MS = 5000;
const BUSY_RETRY_MS = 10000;
// Laisse le temps de répondre à la page avant de couper le serveur.
const RESTART_DELAY_MS = 300;
const MAX_LISTED_CHANGES = 5;

class Updater {
  #rootDir;
  #hub;
  #settings;
  #isBusy;
  #restart;
  #checkEveryMs;
  #checking = false;
  #state = { supported: true, status: 'idle', version: null, behind: 0, changes: [] };

  /**
   * `isBusy` dit si une IA travaille ou attend son tour ; `restart` relance l'appli.
   * Les deux sont fournis de l'extérieur : ce module ne connaît ni les salons ni le serveur.
   */
  constructor({ rootDir, hub, settings, isBusy, restart, checkEveryMinutes }) {
    this.#rootDir = rootDir;
    this.#hub = hub;
    this.#settings = settings;
    this.#isBusy = isBusy;
    this.#restart = restart;
    this.#checkEveryMs = checkEveryMinutes * 60000;
  }

  get state() {
    return this.#state;
  }

  /** Vérifie peu après le démarrage, puis à intervalle régulier. */
  start() {
    // La version est connue tout de suite, sans attendre la première vérification.
    this.#readVersion().then((version) => version && this.#set({ version }));
    setTimeout(() => this.check(), FIRST_CHECK_DELAY_MS).unref();
    setInterval(() => this.check(), this.#checkEveryMs).unref();
  }

  /** Regarde si la branche principale a avancé, et installe si le réglage automatique est actif. */
  async check() {
    if (this.#checking || this.#state.status === 'installing') return this.#state;
    this.#checking = true;
    try {
      this.#set(await this.#inspect());
    } catch (error) {
      // Pas de réseau, dépôt inaccessible : on réessaiera à la prochaine vérification.
      this.#set({ status: 'error', detail: error.message.split('\n')[0] });
    } finally {
      this.#checking = false;
    }
    if (this.#state.status === 'available' && this.#settings.get('autoUpdate')) await this.apply();
    return this.#state;
  }

  /** Installe la mise à jour disponible. Si une IA travaille, attend qu'elle ait fini. */
  async apply() {
    if (!['available', 'pending'].includes(this.#state.status)) return this.#state;
    if (this.#isBusy()) {
      this.#set({ status: 'pending' });
      setTimeout(() => this.apply(), BUSY_RETRY_MS).unref();
      return this.#state;
    }
    this.#set({ status: 'installing' });
    try {
      // « --ff-only » : on avance seulement si rien n'est à fusionner. Le travail local n'est jamais réécrit.
      await this.#git(['merge', '--ff-only', UPSTREAM]);
    } catch (error) {
      return this.#set({ status: 'error', detail: error.message.split('\n')[0] });
    }
    setTimeout(() => this.#restart(), RESTART_DELAY_MS);
    return this.#state;
  }

  #git(args) {
    return git(args, this.#rootDir);
  }

  #set(changes) {
    this.#state = { ...this.#state, detail: undefined, blockedBy: undefined, ...changes };
    this.#hub.broadcast('update', this.#state);
    return this.#state;
  }

  /** Le commit installé, en version courte, ou null si cette copie n'est pas un dépôt git. */
  async #readVersion() {
    return (await this.#isOwnClone()) ? this.#git(['rev-parse', '--short', 'HEAD']) : null;
  }

  /** Compare cette copie à la branche principale du dépôt et décrit la situation. */
  async #inspect() {
    const version = await this.#readVersion();
    if (!version) return { supported: false, reason: 'not_git', status: 'idle' };
    // Sur une autre branche, quelqu'un développe : on ne touche à rien.
    if ((await this.#git(['rev-parse', '--abbrev-ref', 'HEAD'])) !== BRANCH) {
      return { supported: false, reason: 'branch', status: 'idle', version };
    }
    await this.#git(['fetch', '--quiet', REMOTE, BRANCH]);
    const behind = Number(await this.#git(['rev-list', '--count', `HEAD..${UPSTREAM}`]));
    if (!behind) return { supported: true, status: 'idle', version, behind: 0, changes: [] };

    const changes = (await this.#git(['log', '--format=%s', `-${MAX_LISTED_CHANGES}`, `HEAD..${UPSTREAM}`])).split('\n').filter(Boolean);
    const found = { supported: true, version, behind, changes };
    // Des commits ou des modifications propres à cette copie : la personne mettra à jour elle-même.
    if (Number(await this.#git(['rev-list', '--count', `${UPSTREAM}..HEAD`]))) return { ...found, status: 'blocked', blockedBy: 'local_commits' };
    if (await this.#git(['status', '--porcelain', '--untracked-files=no'])) return { ...found, status: 'blocked', blockedBy: 'local_changes' };
    // Une mise à jour déjà en attente le reste, même si une nouvelle vérification passe entre-temps.
    return { ...found, status: this.#state.status === 'pending' ? 'pending' : 'available' };
  }

  /**
   * Vrai si le dossier de l'appli est lui-même un dépôt git. Un Tandem décompressé à l'intérieur
   * d'un autre dépôt ne doit surtout pas mettre à jour ce dépôt-là.
   */
  async #isOwnClone() {
    try {
      const top = await this.#git(['rev-parse', '--show-toplevel']);
      return fs.realpathSync(top) === fs.realpathSync(this.#rootDir);
    } catch {
      return false;
    }
  }
}

module.exports = { Updater };
