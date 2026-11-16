// Les fichiers joints à un message déjà envoyé : les images rejoignent ses vignettes,
// les autres fichiers se téléchargent. Un ancien message n'en a aucun.
import { t } from '../i18n/index.js';
import { fileSize } from '../format.js';
import { escapeHtml } from '../markdown.js';

// Le serveur décide seul de ce qui est une image affichable.
const isImage = (attachment) => attachment.kind === 'image';
const attachmentsOf = (message) => message.attachments || [];

/** Les images jointes à un message, sous la forme des images créées par les agents : { name, url }. */
export const attachedImages = (message) => attachmentsOf(message).filter(isImage);

/** Les noms des fichiers joints : ce qu'un message sans texte a à annoncer. */
export const attachmentNames = (message) => attachmentsOf(message).map((attachment) => attachment.name).join(', ');

/** Les liens de téléchargement des fichiers joints qui ne sont pas des images. */
export function attachedFilesHtml(message) {
  const links = attachmentsOf(message)
    .filter((attachment) => !isImage(attachment))
    .map((file) => {
      const name = escapeHtml(file.name);
      const title = escapeHtml(t('attach.download', { name: file.name }));
      // `download` donne au fichier téléchargé son nom d'origine, que le serveur ne garde pas sur le disque.
      return `<a class="chip" href="${escapeHtml(file.url)}" download="${name}" title="${title}"><span aria-hidden="true">↓</span><span class="chip-name">${name}</span><span class="chip-size">${escapeHtml(fileSize(file.size))}</span></a>`;
    });
  return links.length ? `<div class="chips">${links.join('')}</div>` : '';
}
