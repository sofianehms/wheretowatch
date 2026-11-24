// Startup: compose the services, then show the welcome, the search or the Settings.
import { startApp } from './app.js';
import { compose } from './compose.js';
import { cleanUrl, readLaunchParams } from './core/url.js';
import { applyStaticStrings } from './i18n/strings.js';
import { renderFooter } from './render/attribution.js';

applyStaticStrings(document);
renderFooter(document.getElementById('footer'));
const { q, t } = readLaunchParams(location.search);

// The launch parameters are consumed: leave a clean address behind.
function cleanLaunchUrl() {
  const clean = cleanUrl(location);
  if (clean !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', clean);
}

startApp(compose(), document, { launchQuery: q, launchTitle: t, onTitleLaunchComplete: cleanLaunchUrl });
if (t === null) cleanLaunchUrl();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
