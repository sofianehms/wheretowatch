// Mockup helper, loaded synchronously in <head> like the future src/theme-boot.js.
// ?theme=light | auto | dark (default). Dark stays the default whatever the device setting.
(function () {
  var value = new URLSearchParams(location.search).get('theme');
  var theme = value === 'light' || value === 'auto' ? value : 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  document.addEventListener('DOMContentLoaded', function () {
    // Keep the chosen theme while clicking from one mockup to another.
    if (theme !== 'dark') {
      document.querySelectorAll('a[href$=".html"]').forEach(function (a) {
        a.setAttribute('href', a.getAttribute('href') + '?theme=' + theme);
      });
    }
    // Usage bars: width set through the CSSOM (allowed by a strict CSP, unlike style attributes).
    document.querySelectorAll('[data-fill]').forEach(function (el) {
      el.style.width = Math.min(100, Number(el.getAttribute('data-fill'))) + '%';
    });
    // "Elsewhere in ..." groups: closed on phones, open on wide screens.
    if (window.matchMedia('(min-width: 64rem)').matches) {
      document.querySelectorAll('details[data-open-wide]').forEach(function (d) { d.open = true; });
    }
  });
})();
