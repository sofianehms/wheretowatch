import { DEFAULT_QUOTA_CONFIG } from '../api/quota.js';
import { formatNumber, t } from '../i18n/strings.js';
import { el, externalLink, icon, richText, uniqueId } from './dom.js';

// Look and icon of each key status (a text label and an icon, never color alone).
const statusLook = {
  saved: ['ok', 'checkCircle'],
  valid: ['ok', 'checkCircle'],
  unverified: ['edit', 'info'],
  removed: ['edit', 'info'],
  edit: ['edit', 'info'],
  testing: ['busy', 'refresh'],
  invalid: ['bad', 'alert'],
  network: ['bad', 'alert'],
  timeout: ['bad', 'alert'],
  quota: ['bad', 'alert'],
  failed: ['bad', 'alert'],
};
const providerSpecific = new Set(['invalid', 'quota']);

function statusText(status, provider) {
  const key = providerSpecific.has(status) ? `settings.status.${status}.${provider}` : `settings.status.${status}`;
  return t(key, { provider: t(`settings.${provider}.name`) });
}

function keyField({ provider, settings, checkKey, quotaLimit, onChange }) {
  const id = uniqueId(`key-${provider}`);
  const stateId = `${id}-state`;
  const helpId = `${id}-help`;
  let saved = settings.getKey(provider) ?? '';
  let status = saved ? 'saved' : 'empty';
  let controller = null;
  let busy = false;

  const field = el('div', 'field');
  const label = el('label', 'field__label', t(`settings.${provider}.label`), { for: id });
  label.append(' ', el('small', '', t(`settings.${provider}.badge`)));

  const row = el('div', 'input-row');
  const input = el('input', '', '', {
    id,
    name: id,
    type: 'password',
    value: saved,
    placeholder: t(`settings.${provider}.placeholder`),
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
  });
  const toggle = el('button', 'btn btn--ghost', t('settings.key.show'), { type: 'button', 'aria-pressed': 'false' });
  row.append(input, toggle);

  const state = el('p', 'key-state', '', { id: stateId, role: 'status' });
  const buttons = el('div', 'btn-row');
  const test = el('button', 'btn btn--secondary', t('settings.key.test'), { type: 'button' });
  const save = el('button', 'btn btn--secondary', t('settings.key.save'), { type: 'button' });
  buttons.append(test, save);

  const describedBy = [stateId];
  field.append(label, row, state);
  if (provider === 'sa') {
    const limit = formatNumber(quotaLimit?.() ?? DEFAULT_QUOTA_CONFIG.limit);
    field.append(el('p', 'field__help', t('settings.sa.help', { limit }), { id: helpId }));
    describedBy.push(helpId);
  }
  input.setAttribute('aria-describedby', describedBy.join(' '));
  field.append(buttons);

  const value = () => input.value.trim();

  function idleStatus() {
    if (value() === saved) return saved ? 'saved' : 'empty';
    return 'edit';
  }

  function update() {
    state.replaceChildren();
    state.hidden = status === 'empty';
    state.className = 'key-state';
    if (status !== 'empty') {
      const [tone, iconName] = statusLook[status];
      state.classList.add(`key-state--${tone}`);
      state.append(icon(iconName, 'sm'), statusText(status, provider));
    }
    test.disabled = busy || !value();
    save.disabled = busy || value() === saved;
    field.setAttribute('aria-busy', String(busy));
  }

  // Disabling a button moves focus to the page; hand it back once the work is done.
  function finish(trigger) {
    const lost = document.activeElement === document.body;
    update();
    if (lost && trigger.isConnected) trigger.focus();
  }

  async function runCheck(trigger) {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    busy = true;
    status = 'testing';
    update();
    const result = await checkKey(provider, value(), { signal });
    if (signal.aborted) return null;
    busy = false;
    finish(trigger);
    return result;
  }

  toggle.addEventListener('click', () => {
    const shown = input.type === 'password';
    input.type = shown ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(shown));
    toggle.textContent = t(shown ? 'settings.key.hide' : 'settings.key.show');
  });

  input.addEventListener('input', () => {
    controller?.abort();
    busy = false;
    status = idleStatus();
    update();
  });

  test.addEventListener('click', async () => {
    const result = await runCheck(test);
    if (!result) return;
    status = result === 'valid' && value() === saved ? 'saved' : result;
    finish(test);
  });

  save.addEventListener('click', async () => {
    const entered = value();
    let note = null;
    if (entered && provider === 'tmdb') {
      // The required key is checked before it is kept; a network failure still saves it.
      const result = await runCheck(save);
      if (!result) return;
      if (result === 'invalid') {
        status = result;
        finish(save);
        return;
      }
      if (result !== 'valid') note = 'unverified';
    }
    try {
      if (entered) settings.setKey(provider, entered);
      else settings.removeKey(provider);
    } catch {
      status = 'failed';
      finish(save);
      return;
    }
    saved = entered;
    status = note ?? (entered ? 'saved' : 'removed');
    finish(save);
    onChange(provider);
  });

  update();
  return {
    field,
    abort() {
      controller?.abort();
    },
  };
}

/**
 * Confirmation dialog for clearing every stored value. `onConfirm` may throw; the dialog then
 * shows an error and stays open. Focus starts on Cancel and stays inside the dialog.
 * @param {{onCancel: () => void, onConfirm: () => void}} options
 */
export function renderClearDialog({ onCancel, onConfirm }) {
  const titleId = uniqueId('clear-title');
  const bodyId = uniqueId('clear-body');
  const dialog = el('div', 'dialog', '', {
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    'aria-describedby': bodyId,
  });
  const error = el('p', 'key-state key-state--bad', '', { role: 'alert' });
  error.hidden = true;
  const row = el('div', 'btn-row');
  const cancel = el('button', 'btn btn--secondary', t('settings.clear.cancel'), { type: 'button' });
  const confirm = el('button', 'btn btn--primary', t('settings.clear.confirm'), { type: 'button' });
  row.append(cancel, confirm);
  dialog.append(
    el('h2', '', t('settings.clear.title'), { id: titleId }),
    el('p', 'muted', t('settings.clear.body'), { id: bodyId }),
    error,
    row,
  );

  cancel.addEventListener('click', onCancel);
  confirm.addEventListener('click', () => {
    try {
      onConfirm();
    } catch {
      error.replaceChildren(icon('alert', 'sm'), t('settings.clear.error'));
      error.hidden = false;
    }
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Tab') {
      const order = [cancel, confirm];
      const index = order.indexOf(document.activeElement);
      event.preventDefault();
      order[(index + (event.shiftKey ? -1 : 1) + order.length) % order.length].focus();
    }
  });
  dialog.initialFocus = cancel;
  return dialog;
}

/**
 * Settings screen: the two API keys, how data is kept and the "Clear my data" action.
 * @param {object} options
 * @param {ReturnType<typeof import('../settings/keys.js').createSettings>} options.settings
 * @param {(provider: 'tmdb'|'sa', value: string, deps: {signal: AbortSignal}) => Promise<string>} options.checkKey
 * @param {() => number} [options.quotaLimit] Monthly call limit of the optional source.
 * @param {(provider: string) => void} [options.onChange] Called after a key is saved or removed.
 * @param {() => void} [options.onCleared] Called after all data has been cleared.
 */
export function renderSettings({ settings, checkKey, quotaLimit, onChange = () => {}, onCleared = () => {} }) {
  const root = el('div', 'settings');

  const keysId = uniqueId('settings-keys');
  const dataId = uniqueId('settings-data');
  const keys = el('section', '', '', { 'aria-labelledby': keysId });
  const heading = el('h2', '', t('settings.keys.title'), { id: keysId });
  const tmdb = keyField({ provider: 'tmdb', settings, checkKey, quotaLimit, onChange });
  const sa = keyField({ provider: 'sa', settings, checkKey, quotaLimit, onChange });
  keys.append(
    heading,
    tmdb.field,
    externalLink(t('settings.tmdb.url'), t('settings.tmdb.create')),
    sa.field,
    externalLink(t('settings.sa.url'), t('settings.sa.create')),
    el('p', 'field__help', t('settings.keys.terms')),
  );

  const data = el('section', '', '', { 'aria-labelledby': dataId });
  const prose = el('div', 'prose');
  const retention = el('p');
  richText(retention, t('settings.data.retention'), { webApp: el('strong', '', t('settings.data.webApp')) });
  prose.append(el('p', '', t('settings.data.privacy')), retention);
  const clear = el('button', 'btn btn--danger', t('settings.data.clear'), { type: 'button' });
  const clearRow = el('div');
  clearRow.append(clear);
  data.append(el('h2', '', t('settings.data.title'), { id: dataId }), prose, clearRow);

  let scrim = null;
  function closeDialog({ restoreFocus = true } = {}) {
    scrim?.remove();
    scrim = null;
    if (restoreFocus) clear.focus();
  }
  clear.addEventListener('click', () => {
    const dialog = renderClearDialog({
      onCancel: () => closeDialog(),
      onConfirm() {
        settings.clearAll();
        tmdb.abort();
        sa.abort();
        closeDialog({ restoreFocus: false });
        onCleared();
      },
    });
    scrim = el('div', 'scrim');
    scrim.append(dialog);
    root.append(scrim);
    dialog.initialFocus.focus();
  });

  root.append(keys, data);
  return root;
}
