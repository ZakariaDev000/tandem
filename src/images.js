// Repère les images créées pendant un tour et en garde une copie pour la conversation.
const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
// Dossiers trop gros ou sans intérêt : les parcourir ralentirait chaque tour.
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', 'Pods', 'DerivedData']);
const MAX_SCANNED = 4000;
const MAX_IMAGES_PER_TURN = 8;
const MAX_IMAGE_BYTES = 25e6;

const isImage = (name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());

/** Relève les images d'un dossier : chemin relatif -> empreinte (date et taille). */
function scanImages(dir, depth = 4, found = new Map(), relative = '') {
  if (found.size > MAX_SCANNED) return found;
  let entries;
  try {
    entries = fs.readdirSync(path.join(dir, relative), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const entryPath = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (depth > 0 && !SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.')) scanImages(dir, depth - 1, found, entryPath);
    } else if (entry.isFile() && isImage(entry.name)) {
      try {
        const stat = fs.statSync(path.join(dir, entryPath));
        found.set(entryPath, stat.mtimeMs + ':' + stat.size);
      } catch {}
    }
  }
  return found;
}

/** Les images d'un dossier à plat, modifiées depuis une date donnée. */
function recentImagesIn(dir, since) {
  try {
    return fs
      .readdirSync(dir)
      .filter(isImage)
      .map((name) => ({ name, file: path.join(dir, name) }))
      .filter((image) => fs.statSync(image.file).mtimeMs >= since);
  } catch {
    return [];
  }
}

/**
 * Compare le dossier de travail avant et après un tour, et copie chaque image nouvelle ou
 * modifiée : la conversation montre ainsi chaque version, même si le fichier est remplacé ensuite.
 * `fallbackDir` sert quand l'IA a créé une image dans son propre dossier sans la copier.
 */
function collectNewImages({ cwd, before, startedAt, fallbackDir, destinationDir, urlPrefix, filePrefix }) {
  let created = [...scanImages(cwd)]
    .filter(([relative, signature]) => before.get(relative) !== signature)
    .map(([relative]) => ({ name: relative, file: path.join(cwd, relative) }));
  if (!created.length && fallbackDir) created = recentImagesIn(fallbackDir, startedAt);

  const kept = [];
  for (const image of created.slice(0, MAX_IMAGES_PER_TURN)) {
    try {
      if (fs.statSync(image.file).size > MAX_IMAGE_BYTES) continue;
      fs.mkdirSync(destinationDir, { recursive: true });
      const stored = `${filePrefix}-${kept.length}${path.extname(image.name).toLowerCase()}`;
      fs.copyFileSync(image.file, path.join(destinationDir, stored));
      kept.push({ name: image.name, url: `${urlPrefix}/${stored}` });
    } catch {}
  }
  return kept;
}

module.exports = { scanImages, collectNewImages };
