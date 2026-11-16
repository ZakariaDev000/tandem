// Un court signal sonore fabriqué par le navigateur : deux notes carrées, sans fichier audio.

const NOTES = [
  { frequency: 660, at: 0 },
  { frequency: 880, at: 0.12 },
];
const NOTE_SECONDS = 0.11;
const VOLUME = 0.08;
// Un son débloqué trop tard n'annonce plus rien : mieux vaut alors se taire.
const MAX_WAIT_MS = 1000;

let context = null;

function schedule() {
  for (const note of NOTES) {
    const start = context.currentTime + note.at;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = note.frequency;
    gain.gain.setValueAtTime(VOLUME, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_SECONDS);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + NOTE_SECONDS);
  }
}

export function playChime() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    context ||= new AudioContextClass();
    // Le navigateur garde le son coupé tant que la personne n'a pas touché à la page.
    const asked = Date.now();
    context.resume().then(
      () => {
        if (Date.now() - asked < MAX_WAIT_MS) schedule();
      },
      () => {},
    );
  } catch {}
}
