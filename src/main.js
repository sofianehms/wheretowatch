// Startup: compose the services, then show the welcome, the search or the Settings.
import { startApp } from './app.js';
import { compose } from './compose.js';
import { applyStaticStrings } from './i18n/strings.js';

applyStaticStrings(document);
startApp(compose());

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
