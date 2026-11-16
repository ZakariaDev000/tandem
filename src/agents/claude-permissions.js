// Les demandes d'autorisation de Claude Code. En mode non interactif, ce qu'il n'a pas le droit de
// faire seul est soumis à un outil MCP (option --permission-prompt-tool) : Tandem sert cet outil,
// et c'est la personne qui répond, dans la page.

const SERVER = 'tandem';
const TOOL = 'approve';
const TOOL_ID = `mcp__${SERVER}__${TOOL}`;

// Claude Code abandonne un appel MCP qui tarde ; la personne, elle, répond quand elle veut.
// Vingt-trois jours : presque la plus longue attente qu'un minuteur accepte.
const NO_RUSH_MS = 2_000_000_000;

// Ce que Claude lit quand sa demande n'aboutit pas.
const DENIALS = {
  refused: 'The user refused this action in the Tandem room. Do not retry it and do not work around it: carry on without it, or tell the user what you could not do.',
  stopped: 'The user stopped this turn before answering.',
};

// Le champ qui dit sur quoi porte un appel, outil par outil. Pour un autre outil, son nom suffit.
const SUBJECT_FIELDS = {
  Bash: 'command',
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
  WebFetch: 'url',
  WebSearch: 'query',
};

/** Ce qu'une demande vise, en entier : la commande, le fichier, l'adresse. */
const subjectOf = (name, input) => String(input[SUBJECT_FIELDS[name]] || name);

/**
 * La capacité « demander la permission » de l'adaptateur. `describeTool` met un appel d'outil
 * en action lisible, comme pour le suivi d'un tour.
 */
function createPermissionPrompt(describeTool) {
  return {
    /** Les options qui branchent Claude Code sur l'outil servi à l'adresse `url`. */
    args(url) {
      // L'en-tête est celui que le serveur exige de toute action.
      const servers = { [SERVER]: { type: 'http', url, headers: { 'X-Tandem': '1' }, timeout: NO_RUSH_MS } };
      // L'outil n'est pas fait pour être appelé par Claude lui-même. Et avec quelqu'un pour répondre,
      // Claude Code propose aussi de poser des questions à choix : dans un salon, on écrit à la personne.
      return ['--mcp-config', JSON.stringify({ mcpServers: servers }), '--permission-prompt-tool', TOOL_ID, '--disallowedTools', TOOL_ID, 'AskUserQuestion'];
    },

    /**
     * L'outil que Claude Code interroge. `ask(request, signal)` soumet la demande à la personne
     * et rend { allow } ou { allow: false, reason }.
     */
    tool(ask) {
      return {
        name: TOOL,
        description: 'Asks the user of the Tandem room whether a tool call may run.',
        inputSchema: {
          type: 'object',
          properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
          required: ['tool_name', 'input'],
        },
        async call({ tool_name: name, input = {} }, signal) {
          const decision = await ask({ tool: name, action: describeTool(name, input), summary: subjectOf(name, input), input }, signal);
          return JSON.stringify(decision.allow ? { behavior: 'allow' } : { behavior: 'deny', message: DENIALS[decision.reason] || DENIALS.refused });
        },
      };
    },
  };
}

module.exports = { createPermissionPrompt };
