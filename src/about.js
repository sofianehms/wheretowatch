// Entry point of the "About and privacy" page.
import { compose } from './compose.js';
import { applyStaticStrings } from './i18n/strings.js';
import { aboutText, renderAbout } from './render/about.js';
import { icon } from './render/dom.js';
import { renderClearDialog } from './render/settings.js';
import { applyTheme } from './theme.js';

applyStaticStrings(document);
const { settings } = compose();

let scrim = null;
function closeDialog() {
  scrim.remove();
  scrim = null;
}

const { status } = renderAbout({
  header: document.getElementById('header'),
  main: document.getElementById('main'),
  footer: document.getElementById('footer'),
}, {
  onClear(button) {
    status.replaceChildren();
    const dialog = renderClearDialog({
      onCancel() {
        closeDialog();
        button.focus();
      },
      onConfirm() {
        settings.clearAll();
        applyTheme('dark');
        closeDialog();
        status.replaceChildren(icon('checkCircle', 'sm'), aboutText('stored.cleared'));
        button.focus();
      },
    });
    scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.append(dialog);
    document.body.append(scrim);
    dialog.initialFocus.focus();
  },
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
