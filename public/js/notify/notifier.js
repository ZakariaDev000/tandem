// Prévenir la personne pendant qu'elle regarde ailleurs : notification du navigateur et signal sonore.
// Ses deux réglages restent dans le navigateur.
import { readPref, writePref } from '../prefs.js';
import { channelsFor } from './decide.js';
import { playChime } from './sound.js';

const DESKTOP = 'notify';
const SOUND = 'sound';
const ON = 'on';

/** Demande la permission. Les anciens Safari répondent par une fonction de rappel, les autres par une promesse. */
function askPermission() {
  return new Promise((resolve) => {
    const answer = Notification.requestPermission(resolve);
    if (answer) answer.then(resolve, resolve);
  });
}

/**
 * `isWatching(roomId)` dit si la personne a ce salon sous les yeux ; `onOpen(roomId)` l'affiche
 * quand elle clique une notification.
 */
export function createNotifier({ isWatching, onOpen }) {
  const supported = 'Notification' in window;
  const wanted = { desktop: readPref(DESKTOP) === ON, sound: readPref(SOUND) === ON };

  /** Ce que le navigateur autorise vraiment : « default » tant qu'on ne lui a rien demandé. */
  const permission = () => (supported ? Notification.permission : 'unsupported');

  const desktopActive = () => wanted.desktop && permission() === 'granted';

  function show({ title, body, roomId }) {
    try {
      // Une étiquette par salon : une nouvelle notification remplace la précédente au lieu de s'empiler.
      const notification = new Notification(title, { body, tag: 'tandem-' + (roomId || 'app') });
      notification.onclick = () => {
        window.focus();
        if (roomId) onOpen(roomId);
        notification.close();
      };
    } catch {}
  }

  return {
    permission,

    /** Vrai si les notifications du navigateur sont demandées et qu'il les autorise. */
    get desktop() {
      return desktopActive();
    },
    get sound() {
      return wanted.sound;
    },

    /**
     * Active ou coupe les notifications du navigateur. La permission n'est demandée qu'ici :
     * à n'appeler que sur un clic de la personne. Renvoie ce qui est finalement actif.
     */
    async setDesktop(on) {
      if (on && permission() === 'default') await askPermission();
      wanted.desktop = on && permission() === 'granted';
      writePref(DESKTOP, wanted.desktop ? ON : '');
      return wanted.desktop;
    },

    /** Active ou coupe le signal sonore, et le fait entendre quand on l'active. */
    setSound(on) {
      wanted.sound = on;
      writePref(SOUND, on ? ON : '');
      if (on) playChime();
    },

    /** Montre une notification même si la personne regarde la page : pour qu'elle voie à quoi s'attendre. */
    preview({ title, body }) {
      if (desktopActive()) show({ title, body });
    },

    /**
     * Le point d'entrée de tout ce qui mérite d'attirer l'attention : un titre, un texte,
     * et le salon concerné. Ne fait rien si la personne a déjà ce salon sous les yeux.
     */
    notify({ title, body, roomId }) {
      const channels = channelsFor({ watching: isWatching(roomId), ...wanted, permission: permission() });
      if (channels.desktop) show({ title, body, roomId });
      if (channels.sound) playChime();
    },
  };
}
