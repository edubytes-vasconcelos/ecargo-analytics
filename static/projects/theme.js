/* Persist the selected appearance and apply it before stylesheets paint. */
(() => {
  const storageKey = 'ecargo-projects-theme';
  const root = document.documentElement;
  let theme = 'light';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'dark' || saved === 'light') theme = saved;
  } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  root.dataset.theme = theme;

  function syncButton() {
    const button = document.querySelector('#themeToggleButton');
    if (!button) return;
    const dark = root.dataset.theme === 'dark';
    const label = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('#themeToggleButton');
    syncButton();
    button?.addEventListener('click', () => {
      theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = theme;
      try { localStorage.setItem(storageKey, theme); } catch { /* Keep the current page theme. */ }
      syncButton();
    });
  });
})();
