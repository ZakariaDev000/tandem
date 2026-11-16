// Adaptateur pour Claude Code, lancé en mode non interactif (`claude -p`).
const crypto = require('node:crypto');
const { shorten, baseName } = require('../util');
const { createPermissionPrompt } = require('./claude-permissions');

// Outils retirés à Claude quand le salon est en lecture seule.
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'Bash'];

function describeTool(name, input = {}) {
  switch (name) {
    case 'Read':
      return { verb: 'read', target: baseName(input.file_path) };
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return { verb: 'edit', target: baseName(input.file_path || input.notebook_path) };
    case 'Bash':
      return { verb: 'run', target: shorten(input.description || input.command, 60) };
    case 'Grep':
    case 'Glob':
      return { verb: 'search', target: shorten(input.pattern, 50) };
    case 'WebSearch':
      return { verb: 'web', target: shorten(input.query, 50) };
    case 'WebFetch':
      return { verb: 'open', target: shorten(input.url, 50) };
    default:
      return { verb: 'tool', target: name };
  }
}

const permissionPrompt = createPermissionPrompt(describeTool);

module.exports = {
  id: 'claude',
  name: 'Claude',
  product: 'Claude Code',
  command: 'claude',
  // Claude reçoit les consignes du salon comme consignes système, à chaque tour.
  rulesInFirstPrompt: false,
  generatesImages: false,
  // Son outil de lecture lui montre une image dont on lui donne le chemin.
  viewsImageFiles: true,
  // Capacité facultative : ce que Claude Code ne peut pas faire seul, il le demande à la personne.
  permissionPrompt,

  buildArgs({ session, access, rules, readableDirs = [], permissionUrl }) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--append-system-prompt', rules];
    // En lecture seule, rien n'est demandé : écritures et commandes restent refusées d'office.
    if (access === 'read') args.push('--disallowedTools', ...WRITE_TOOLS);
    else args.push('--permission-mode', 'acceptEdits', ...(permissionUrl ? permissionPrompt.args(permissionUrl) : []));
    // Claude Code refuse de lire hors du dossier de travail, sauf dans les dossiers qu'on lui ouvre.
    if (readableDirs.length) args.push('--add-dir', ...readableDirs);
    if (session) return { args: [...args, '--resume', session], session };
    // On choisit nous-mêmes l'identifiant d'une nouvelle session, pour pouvoir la reprendre ensuite.
    const fresh = crypto.randomUUID();
    return { args: [...args, '--session-id', fresh], session: fresh };
  },

  /** Lit un événement de la sortie de Claude Code et met à jour l'état du tour. */
  readEvent(event, turn, onActivity) {
    if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
      turn.session = event.session_id;
    } else if (event.type === 'assistant') {
      for (const block of event.message?.content || []) {
        if (block.type === 'tool_use') onActivity(describeTool(block.name, block.input));
        else if (block.type === 'text' && block.text.trim()) turn.lastText = block.text;
      }
    } else if (event.type === 'result') {
      if (event.is_error || event.subtype !== 'success') {
        turn.failure = event.result || event.subtype || 'unknown error';
        // Le texte d'erreur arrive aussi comme un message de l'IA : sans cela, il passerait pour sa réponse.
        turn.lastText = null;
      }
      else turn.finalText = event.result;
    }
  },

  /** Claude range ses images directement dans le dossier de travail. */
  generatedImagesDir() {
    return null;
  },
};
