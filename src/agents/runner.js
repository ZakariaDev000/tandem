// Lance un tour d'une IA dans son outil en ligne de commande, quel que soit l'outil.
const { spawn } = require('node:child_process');
const { StoppedError } = require('../errors');
const { shorten } = require('../util');

/** Appelle onEvent pour chaque ligne JSON d'un flux. Les lignes qui ne sont pas du JSON sont ignorées. */
function readJsonLines(stream, onEvent) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {}
    }
  });
}

/**
 * Démarre un tour. Renvoie `done`, tenue avec { text, session } à la fin du tour,
 * et `stop()` pour l'interrompre (`done` est alors rejetée avec StoppedError).
 * `readableDirs` nomme les dossiers hors du dossier de travail que l'IA doit pouvoir lire.
 * `permissionUrl` est l'adresse où une IA qui sait le faire demande la permission d'agir.
 */
function startTurn(agent, { cwd, access, session, rules, prompt, readableDirs = [], permissionUrl }, onActivity) {
  if (!agent.binary) {
    return { done: Promise.reject(new Error(`${agent.product} was not found on this machine.`)), stop() {} };
  }
  const built = agent.buildArgs({ session, access, rules, cwd, readableDirs, permissionUrl });
  const turn = { session: built.session, finalText: null, lastText: null, failure: null };
  const child = spawn(agent.binary, built.args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stopped = false;
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)));
  readJsonLines(child.stdout, (event) => agent.readEvent(event, turn, onActivity));

  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (stopped) return reject(new StoppedError());
      // Sans résultat final, le dernier texte écrit par l'IA fait office de réponse.
      const text = turn.finalText ?? turn.lastText;
      if (text) return resolve({ text, session: turn.session });
      if (turn.failure) return reject(new Error(shorten(turn.failure, 400)));
      const tail = stderr.trim().split('\n').slice(-3).join(' ');
      reject(new Error(`No reply (exit ${code ?? signal}). ${shorten(tail, 300)}`));
    });
  });
  child.stdin.end(prompt);

  return {
    done,
    stop() {
      stopped = true;
      child.kill('SIGTERM');
    },
  };
}

module.exports = { startTurn };
