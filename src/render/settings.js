import { DEFAULT_QUOTA_CONFIG } from '../api/quota.js';
import { formatNumber, t } from '../i18n/strings.js';
import { applyTheme, THEMES } from '../theme.js';
import { el, externalLink, icon, richText, uniqueId } from './dom.js';

// Theme choice applied but not saved, kept so reopening Settings stays in sync with the page.
let unsavedTheme = null;

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

function statusText(status, provider, durable) {
  let key = providerSpecific.has(status) ? `settings.status.${status}.${provider}` : `settings.status.${status}`;
  if (!durable && (status === 'saved' || status === 'unverified')) key += '.session';
  return t(key, { provider: t(`settings.${provider}.name`) });
}

function keyField({ provider, settings, checkKey, quotaLimit, durable, onChange, onUpdate = () => {} }) {
  const id = uniqueId(`key-${provider}`);
  const stateId = `${id}-state`;
  const helpId = `${id}-help`;
  let saved = settings.getKey(provider) ?? '';
  // A saved key whose last check failed keeps that status until it is tested again.
  const savedStatus = () => (settings.isUnverified(provider) ? 'unverified' : 'saved');
  let status = saved ? savedStatus() : 'empty';
  let controller = null;
  let busy = false;
  // The last value that was tested and its result, so a tested key is not checked again on Save.
  let tested = null;

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
    if (value() === saved) return saved ? savedStatus() : 'empty';
    return 'edit';
  }

  function update() {
    state.replaceChildren();
    state.hidden = status === 'empty';
    state.className = 'key-state';
    if (status !== 'empty') {
      const [tone, iconName] = statusLook[status];
      state.classList.add(`key-state--${tone}`);
      state.append(icon(iconName, 'sm'), statusText(status, provider, durable));
    }
    // aria-disabled keeps the buttons focusable, so keyboard focus is never dropped.
    test.setAttribute('aria-disabled', String(busy || !value()));
    save.setAttribute('aria-disabled', String(busy || value() === saved));
    field.setAttribute('aria-busy', String(busy));
    onUpdate();
  }

  async function runCheck() {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    busy = true;
    status = 'testing';
    update();
    const checked = value();
    const result = await checkKey(provider, checked, { signal });
    if (signal.aborted) return null;
    tested = { value: checked, result };
    busy = false;
    update();
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
    if (test.getAttribute('aria-disabled') === 'true') return;
    const result = await runCheck();
    if (!result) return;
    const verifiedSaved = result === 'valid' && value() === saved;
    if (verifiedSaved) {
      try {
        settings.setKey(provider, saved);
      } catch {
        // The key stays saved; only the unchecked mark could not be cleared.
      }
    }
    status = verifiedSaved ? 'saved' : result;
    update();
    // A saved key that is now verified ends the first run.
    if (status === 'saved') onChange(provider, status);
  });

  save.addEventListener('click', async () => {
    if (save.getAttribute('aria-disabled') === 'true') return;
    const entered = value();
    let note = null;
    if (entered) {
      // Both keys are checked before they are kept (the optional one costs one call of its
      // monthly quota); a value just tested is not checked again. A network failure still saves it.
      // Only a definitive result is reused; a network failure is checked again now.
      const reusable = tested?.value === entered && (tested.result === 'valid' || tested.result === 'invalid');
      const result = reusable ? tested.result : await runCheck();
      if (!result) return;
      if (result === 'invalid') {
        status = result;
        update();
        return;
      }
      if (result !== 'valid') note = 'unverified';
    }
    try {
      if (entered) settings.setKey(provider, entered, { verified: note === null });
      else settings.removeKey(provider);
    } catch {
      status = 'failed';
      update();
      return;
    }
    saved = entered;
    status = note ?? (entered ? 'saved' : 'removed');
    update();
    onChange(provider, status);
  });

  update();
  return {
    field,
    save,
    dirty: () => value() !== saved,
    busy: () => busy,
    abort() {
      controller?.abort();
    },
  };
}

/**
 * Confirmation dialog for clearing every stored value. `onConfirm` may throw; the dialog then
 * shows an error and stays open. Focus starts on Cancel and stays inside the dialog.
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
 */
export function renderSettings({ settings, checkKey, quotaLimit, durable = true, onChange = () => {}, onCleared = () => {} }) {
  const root = el('div', 'settings');

  const keysId = uniqueId('settings-keys');
  const dataId = uniqueId('settings-data');
  const keys = el('section', '', '', { 'aria-labelledby': keysId });
  const heading = el('h2', '', t('settings.keys.title'), { id: keysId });
  // Only one Save is primary at a time: the first field with a pending change.
  let tmdb;
  let sa;
  const markPrimary = () => {
    const first = [tmdb, sa].find((field) => field?.dirty());
    for (const field of [tmdb, sa]) {
      if (field) field.save.className = field === first ? 'btn btn--primary' : 'btn btn--secondary';
    }
  };
  tmdb = keyField({ provider: 'tmdb', settings, checkKey, quotaLimit, durable, onChange, onUpdate: markPrimary });
  sa = keyField({ provider: 'sa', settings, checkKey, quotaLimit, durable, onChange, onUpdate: markPrimary });
  markPrimary();
  keys.append(
    heading,
    tmdb.field,
    externalLink(t('settings.tmdb.url'), t('settings.tmdb.create')),
    sa.field,
    externalLink(t('settings.sa.url'), t('settings.sa.create')),
    el('p', 'field__help', t('settings.keys.terms')),
  );
  if (!durable) keys.insertBefore(el('p', 'key-state key-state--edit', t('settings.keys.session'), { role: 'status' }), tmdb.field);

  const data = el('section', '', '', { 'aria-labelledby': dataId });
  const prose = el('div', 'prose');
  const retention = el('p');
  richText(retention, t('settings.data.retention'), { webApp: el('strong', '', t('settings.data.webApp')) });
  prose.append(el('p', '', t('settings.data.privacy')), retention);
  const clear = el('button', 'btn btn--danger', t('settings.data.clear'), { type: 'button' });
  const clearRow = el('div');
  clearRow.append(clear);
  data.append(el('h2', '', t('settings.data.title'), { id: dataId }), prose, clearRow);

  const themeId = uniqueId('settings-theme');
  const helpId = `${themeId}-help`;
  const theme = el('section', '', '', { 'aria-labelledby': themeId });
  const group = el('fieldset', 'segmented', '', { 'aria-describedby': helpId });
  group.append(el('legend', 'visually-hidden', t('settings.theme.title')));
  const themeName = uniqueId('theme');
  const themeNote = el('p', 'key-state key-state--bad', '', { role: 'status' });
  themeNote.hidden = true;
  // A choice that applied but could not be saved stays selected, with its warning, when Settings reopens.
  const shown = unsavedTheme ?? settings.getPref('theme');
  const showSaveError = () => {
    themeNote.replaceChildren(icon('alert', 'sm'), t('settings.theme.error'));
    themeNote.hidden = false;
  };
  if (unsavedTheme) showSaveError();
  for (const value of THEMES) {
    const label = el('label');
    const radio = el('input', '', '', { type: 'radio', name: themeName, value });
    radio.checked = shown === value;
    radio.addEventListener('change', () => {
      applyTheme(value, root.ownerDocument);
      try {
        settings.setPref('theme', value);
        unsavedTheme = null;
        themeNote.hidden = true;
      } catch {
        unsavedTheme = value;
        showSaveError();
      }
    });
    label.append(radio, t(`settings.theme.${value}`));
    group.append(label);
  }
  theme.append(
    el('h2', '', t('settings.theme.title'), { id: themeId }),
    group,
    el('p', 'field__help', t('settings.theme.help'), { id: helpId }),
    themeNote,
  );

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
        unsavedTheme = null;
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

  root.confirming = () => scrim !== null;
  root.pending = () => tmdb.busy() || sa.busy();
  root.dispose = () => {
    tmdb.abort();
    sa.abort();
  };
  root.append(keys, theme, data);
  return root;
}
