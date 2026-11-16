// Les salons où un message est arrivé sans que la personne le voie : elle regardait
// un autre salon, ou une autre fenêtre.

/**
 * `onSeen` est appelé quand la personne revient à la fenêtre et retrouve sous ses yeux
 * un salon qui n'était pas lu.
 */
export function createUnread({ store, onSeen }) {
  const ids = new Set();

  const isWatching = (roomId) => roomId === store.currentId && document.visibilityState === 'visible' && document.hasFocus();

  /** Le salon affiché est lu dès qu'il est sous les yeux de la personne. Renvoie true s'il ne l'était pas. */
  const seeCurrent = () => isWatching(store.currentId) && ids.delete(store.currentId);

  const onReturn = () => {
    if (seeCurrent()) onSeen();
  };
  window.addEventListener('focus', onReturn);
  document.addEventListener('visibilitychange', onReturn);

  return {
    isWatching,
    seeCurrent,
    has: (roomId) => ids.has(roomId),

    /** Un message arrive dans ce salon. */
    add(roomId) {
      if (!isWatching(roomId)) ids.add(roomId);
    },

    /** Le nombre de salons non lus. Un salon supprimé entre-temps ne compte plus. */
    get count() {
      return [...ids].filter((id) => store.has(id)).length;
    },
  };
}
