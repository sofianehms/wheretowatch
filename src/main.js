// Entry point of the single-view tool. Replace with the real behaviour defined in the design brief.
const input = document.querySelector('#q');
const status = document.querySelector('#status');

input.addEventListener('input', () => {
  status.textContent = input.value.trim() ? 'Searching…' : 'Type to search.';
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // Let the initial page resources load before the worker starts filling the offline cache.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }, { once: true });
}
