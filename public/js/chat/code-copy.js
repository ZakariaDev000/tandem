// Le bouton « Copier » des blocs de code d'un message.
import { t } from '../i18n/index.js';

const CONFIRM_MS = 1500;

function copyButton(code) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn small copy';
  button.textContent = t('code.copy');
  // Le changement de texte du bouton est aussi annoncé à qui ne le voit pas.
  button.setAttribute('aria-live', 'polite');
  let reset = null;
  button.addEventListener('click', async () => {
    let outcome = 'code.copied';
    try {
      await navigator.clipboard.writeText(code.textContent);
    } catch {
      // Le presse-papiers peut être refusé par le navigateur : on le dit au lieu de faire croire que c'est copié.
      outcome = 'code.copyFailed';
    }
    button.textContent = t(outcome);
    clearTimeout(reset);
    reset = setTimeout(() => {
      button.textContent = t('code.copy');
    }, CONFIRM_MS);
  });
  return button;
}

/** Ajoute un bouton « Copier » à chaque bloc de code du texte d'un message. */
export function addCopyButtons(root) {
  for (const pre of root.querySelectorAll('.text pre')) {
    // Le bouton vit dans un cadre autour du bloc : il ne défile pas avec une longue ligne de code.
    const frame = document.createElement('div');
    frame.className = 'code';
    pre.replaceWith(frame);
    frame.append(copyButton(pre), pre);
  }
}
