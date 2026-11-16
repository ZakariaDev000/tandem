// Adaptateur pour Codex, l'agent de ChatGPT, lancé en mode non interactif (`codex exec`).
const os = require('node:os');
const path = require('node:path');
const { shorten, baseName } = require('../util');

function describeItem(item) {
  switch (item.type) {
    case 'command_execution': {
      // Codex enveloppe chaque commande dans « /bin/zsh -lc '…' » : on ne garde que la commande.
      const command = String(item.command || '')
        .replace(/^\S*\/(?:zsh|bash|sh)\s+-l?c\s+/, '')
        .replace(/^(['"])([\s\S]*)\1$/, '$2');
      return { verb: 'run', target: shorten(command, 60) };
    }
    case 'file_change': {
      const files = (item.changes || []).map((change) => baseName(change.path)).filter(Boolean);
      return { verb: 'edit', target: files.slice(0, 3).join(', ') };
    }
    case 'web_search':
      return { verb: 'web', target: shorten(item.query, 50) };
    case 'mcp_tool_call':
      return { verb: 'tool', target: item.tool || 'MCP' };
    default:
      return null;
  }
}

module.exports = {
  id: 'chatgpt',
  name: 'ChatGPT',
  product: 'Codex',
  command: 'codex',
  // Codex n'a pas d'option pour des consignes système : elles ouvrent le premier message.
  rulesInFirstPrompt: true,
  generatesImages: true,
  // Pas établi : à l'essai, Codex a décodé l'image jointe avec un script au lieu de la regarder.
  viewsImageFiles: false,

  buildArgs({ session, access, cwd }) {
    // Les deux bacs à sable lisent tout le disque : rien à ouvrir pour les fichiers joints.
    const sandbox = access === 'read' ? 'read-only' : 'workspace-write';
    // La reprise d'une session n'accepte pas l'option « -s » : le bac à sable passe par la configuration.
    if (session) {
      return { args: ['exec', 'resume', session, '--json', '--skip-git-repo-check', '-c', `sandbox_mode="${sandbox}"`, '-'], session };
    }
    return { args: ['exec', '--json', '--skip-git-repo-check', '-s', sandbox, '-C', cwd, '-'], session: null };
  },

  /** Lit un événement de la sortie de Codex et met à jour l'état du tour. */
  readEvent(event, turn, onActivity) {
    if (event.type === 'thread.started' && event.thread_id) {
      turn.session = event.thread_id;
    } else if (event.type === 'item.started' || event.type === 'item.completed') {
      const item = event.item || {};
      if (item.type === 'agent_message') {
        if (event.type === 'item.completed' && item.text) turn.lastText = item.text;
      } else if (event.type === 'item.started' || item.type === 'file_change') {
        // Une commande est annoncée à son démarrage ; un changement de fichier n'arrive qu'une fois fini.
        const action = describeItem(item);
        if (action) onActivity(action);
      }
    } else if (event.type === 'turn.failed') {
      turn.failure = event.error?.message || 'the turn failed';
    } else if (event.type === 'error') {
      turn.failure = event.message || 'unknown error';
    }
  },

  /** Codex crée d'abord ses images dans son propre dossier, une par session. */
  generatedImagesDir(session) {
    return session ? path.join(os.homedir(), '.codex', 'generated_images', session) : null;
  },
};
