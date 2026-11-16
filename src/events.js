/** Diffuse les événements du serveur aux pages ouvertes (Server-Sent Events). */
class EventHub {
  #clients = new Set();

  /** Branche une page et lui envoie d'abord l'état complet. */
  subscribe(req, res, hello) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(EventHub.#frame('hello', hello));
    this.#clients.add(res);
    // Un commentaire régulier empêche la connexion d'être coupée pour inactivité.
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      this.#clients.delete(res);
    });
  }

  broadcast(event, data) {
    const frame = EventHub.#frame(event, data);
    for (const res of this.#clients) res.write(frame);
  }

  static #frame(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}

module.exports = { EventHub };
