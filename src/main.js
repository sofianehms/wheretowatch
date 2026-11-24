// Startup: compose the services, then show the welcome, the search or the Settings.
import { startApp } from './app.js';
import { compose } from './compose.js';
import { cleanUrl, readLaunchParams } from './core/url.js';
import { applyStaticStrings } from './i18n/strings.js';
import { renderFooter } from './render/attribution.js';

applyStaticStrings(document);
renderFooter(document.getElementById('footer'));
const { q } = readLaunchParams(location.search);
startApp(compose(), document, { launchQuery: q });

// The launch parameters are consumed: leave a clean address behind.
const clean = cleanUrl(location);
if (clean !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', clean);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
