// Le titre de l'onglet rappelle les salons non lus à qui a laissé Tandem en arrière-plan.
const NAME = document.title;

export function showUnreadInTitle(count) {
  document.title = count ? `(${count}) ${NAME}` : NAME;
}
