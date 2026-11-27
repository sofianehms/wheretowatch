// Startup: compose the services, then show the welcome, the search or the Settings.
import { startApp } from './app.js';
import { compose } from './compose.js';
import { cleanUrl, readLaunchParams } from './core/url.js';
import { applyStaticStrings } from './i18n/strings.js';
import { renderFooter } from './render/attribution.js';
import { renderInstallHint } from './render/install.js';
import { createEditGuard, watchForUpdate } from './sw-update.js';

applyStaticStrings(document);
renderFooter(document.getElementById('footer'));
const { q, t } = readLaunchParams(location.search);

// The launch parameters are consumed: leave a clean address behind.
function cleanLaunchUrl() {
  const clean = cleanUrl(location);
  if (clean !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', clean);
}

const app = compose();
const edits = createEditGuard();
renderInstallHint(document.getElementById('install'), { settings: app.settings });
const screens = startApp(app, document, {
  launchQuery: q, launchTitle: t, onTitleLaunchComplete: cleanLaunchUrl, online: navigator.onLine !== false,
  onUnsavedChange: edits.set,
});
addEventListener('online', () => screens.setOnline(true));
addEventListener('offline', () => screens.setOnline(false));
if (t === null) cleanLaunchUrl();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const registering = navigator.serviceWorker.register('sw.js');
  watchForUpdate(navigator.serviceWorker, registering, document.getElementById('update'), () => location.reload(), edits.anywhere)
    .catch(() => {});
}
