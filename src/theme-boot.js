// Classic script, loaded synchronously in <head> after the stylesheets so the theme is set before first paint.
// Stored preference: localStorage['wtw.theme'] is 'dark' (default), 'light' or 'auto'.
(function () {
  var root = document.documentElement;
  var theme = 'dark';
  try {
    var stored = localStorage.getItem('wtw.theme');
    if (stored === 'light' || stored === 'auto') theme = stored;
  } catch (error) {
    // Storage unavailable: keep the dark default.
  }
  root.setAttribute('data-theme', theme);

  function syncThemeColor() {
    var bg = getComputedStyle(root).getPropertyValue('--color-bg').trim();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (bg && meta) meta.setAttribute('content', bg);
  }
  syncThemeColor();

  if (theme === 'auto' && window.matchMedia) {
    var query = window.matchMedia('(prefers-color-scheme: light)');
    if (query.addEventListener) query.addEventListener('change', syncThemeColor);
  }
})();
