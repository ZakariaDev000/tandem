// Un serveur MCP réduit à l'essentiel : il présente des outils à un client qui lui parle en HTTP.
// Seul ce module connaît le protocole (JSON-RPC, flux d'événements) ; un outil n'est qu'une fonction.
const { AppError } = require('../errors');
const { readJson, sendJson } = require('./respond');

const KEEP_ALIVE_MS = 25000;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * Lance un outil et rend son résultat par un flux d'événements : la réponse peut tarder autant
 * qu'il le faut, la connexion reste ouverte. `signal` prévient l'outil si le client se retire avant.
 */
async function callTool(res, id, tool, args) {
  const departure = new AbortController();
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
  // Un commentaire régulier empêche la connexion d'être coupée pour inactivité.
  res.write(': waiting\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), KEEP_ALIVE_MS);
  res.on('close', () => {
    clearInterval(ping);
    departure.abort();
  });

  let result;
  try {
    result = { content: [{ type: 'text', text: await tool.call(args, departure.signal) }] };
  } catch (error) {
    result = { content: [{ type: 'text', text: error.message }], isError: true };
  }
  res.end(`event: message\ndata: ${JSON.stringify(reply(id, result))}\n\n`);
}

/**
 * Répond à un message MCP reçu en HTTP. `tools` est une liste de { name, description, inputSchema, call } ;
 * `call(args, signal)` renvoie le texte du résultat, tout de suite ou plus tard.
 */
async function serveMcp(req, res, { name, tools }) {
  // Le client essaie aussi d'ouvrir un flux que le serveur n'utilise pas : le protocole veut ce refus-là.
  if (req.method !== 'POST') throw new AppError(405, 'method_not_allowed', 'Method not allowed.');
  const { id, method, params = {} } = await readJson(req);
  // Une notification n'attend pas de réponse.
  if (id === undefined) return res.writeHead(202).end();

  switch (method) {
    case 'initialize':
      // Ce qui est servi ici n'a pas changé d'une version du protocole à l'autre : celle du client convient.
      return sendJson(res, 200, reply(id, { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name, version: '1' } }));
    case 'tools/list':
      return sendJson(res, 200, reply(id, { tools: tools.map(({ call, ...described }) => described) }));
    case 'tools/call': {
      const tool = tools.find((candidate) => candidate.name === params.name);
      if (!tool) return sendJson(res, 200, failure(id, INVALID_PARAMS, `Unknown tool: ${params.name}`));
      return callTool(res, id, tool, params.arguments || {});
    }
    default:
      return sendJson(res, 200, failure(id, METHOD_NOT_FOUND, `Method not found: ${method}`));
  }
}

module.exports = { serveMcp };
