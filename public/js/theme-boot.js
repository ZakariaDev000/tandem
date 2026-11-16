// Pose le thème avant le premier affichage, pour ne jamais montrer un instant le mauvais.
// Un module se charge trop tard pour cela : ce script-ci est classique et bloquant, d'où
// cette règle écrite une seconde fois, la même que dans theme.js.
(() => {
  let choice = null;
  try {
    choice = localStorage.getItem('tandem.theme');
  } catch {}
  const dark = choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
