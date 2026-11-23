import { posterSrcset } from '../core/images.js';
import { t } from '../i18n/strings.js';
import { el, icon, uniqueId } from './dom.js';

/**
 * Wire the search input to its status line.
 * @param {HTMLInputElement} input
 * @param {HTMLElement} status
 * @returns {{reset: () => void}} `reset()` empties the query and shows the hint again.
 */
export function bindSearch(input, status) {
  input.addEventListener('input', () => {
    status.textContent = input.value.trim() ? t('search.loading') : t('search.hint');
  });
  return {
    reset() {
      input.value = '';
      status.textContent = t('search.hint');
    },
  };
}

/**
 * Fallback switch (R-22): `true` renders the suggestions as a plain list of links, without the
 * combobox role, for the case where the combobox misbehaves with VoiceOver on iPhone.
 */
export const COMBOBOX_FALLBACK = false;

const MAX_SUGGESTIONS = 8;
// Posters of the first rows load right away; the rest wait until they are scrolled near.
const EAGER_POSTERS = 4;
const TONES = 6;
const SKELETON_ROWS = 3;

const errorTexts = {
  timeout: 'search.error.timeout',
  server: 'search.error.server',
  quota: 'search.error.quota',
  rateLimited: 'search.error.quota',
  auth: 'search.error.auth',
};

const controllers = new WeakMap();

function initials(title) {
  return title.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0].toUpperCase()).join('');
}

function poster(title, index, configuration) {
  const tone = (title.tmdbId ?? index) % TONES + 1;
  const frame = el('div', `poster tone-${tone}`, '', { 'aria-hidden': 'true' });
  const source = posterSrcset(title.posterPath, 'thumb', configuration);
  if (!source) {
    frame.textContent = initials(title.title);
    return frame;
  }
  // The reserved box comes from the stylesheet; the attributes give the intrinsic ratio.
  const image = el('img', 'poster__image', '', {
    src: source.src,
    srcset: source.srcset,
    alt: '',
    width: '48',
    height: '72',
    loading: index < EAGER_POSTERS ? 'eager' : 'lazy',
    decoding: 'async',
  });
  // A poster that fails to load falls back to the neutral initials.
  image.addEventListener('error', () => {
    image.remove();
    frame.textContent = initials(title.title);
  });
  frame.append(image);
  return frame;
}

function highlighted(parent, text, query) {
  const lower = text.toLocaleLowerCase();
  const start = query ? lower.indexOf(query.toLocaleLowerCase()) : -1;
  if (start < 0 || lower.length !== text.length) {
    parent.append(text);
    return;
  }
  const end = start + query.length;
  parent.append(text.slice(0, start), el('mark', '', text.slice(start, end)), text.slice(end));
}

function optionContent(title, index, query, configuration) {
  const lines = el('span', 'option__lines');
  const name = el('span', 'option__title');
  highlighted(name, title.title, query.trim());
  const type = t(`search.type.${title.mediaType}`);
  const meta = title.year == null ? type : t('search.meta.year', { year: title.year, type });
  lines.append(name, el('span', 'option__meta', meta));
  return [poster(title, index, configuration), lines];
}

/**
 * Render the search field and its suggestions into `container`. Calling it again on the same
 * container updates the existing field, so the focus and the typed text are kept.
 * @param {HTMLElement} container
 * @param {{status: 'idle'|'loading'|'results'|'empty'|'error', query?: string, value?: string,
 *   titles?: import('../api/sources.js').Title[], error?: {type?: string}, online?: boolean,
 *   imageConfiguration?: object|null}} state
 * @param {{onInput?: (value: string) => void, onSubmit?: (value: string) => void,
 *   onChoose?: (title: object) => void, onRetry?: (value: string) => void,
 *   onCheckKey?: () => void, onCancel?: () => void, onCompositionStart?: () => void,
 *   onCompositionEnd?: (value: string) => void, hrefFor?: (title: object) => string}} [handlers]
 * @param {{fallback?: boolean}} [options]
 */
export function render(container, state, handlers = {}, { fallback = COMBOBOX_FALLBACK } = {}) {
  const existing = controllers.get(container);
  if (existing && existing.fallback === fallback) {
    existing.update(state, handlers);
    return existing;
  }
  const controller = build(container, fallback);
  controllers.set(container, controller);
  controller.update(state, handlers);
  return controller;
}

function build(container, fallback) {
  const id = uniqueId('search');
  const listId = `${id}-suggestions`;
  const hintId = `${id}-hint`;
  const root = el('div', 'search');
  const label = el('label', 'visually-hidden', t('search.label'), { for: `${id}-input` });
  const field = el('div', 'search__field');
  const comboboxAttributes = fallback ? {} : {
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': listId,
  };
  const input = el('input', 'search__input', '', {
    id: `${id}-input`,
    type: 'search',
    placeholder: t('search.placeholder'),
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-describedby': hintId,
    ...comboboxAttributes,
  });
  const clear = el('button', 'icon-btn', '', { type: 'button', 'aria-label': t('search.clear'), hidden: '' });
  clear.append(icon('close'));
  field.append(icon('search'), input, clear);

  // The list is a sibling of the field, not a child (R-22 mitigation for screen readers).
  const list = el('ul', 'listbox', '', { id: listId, 'aria-label': t('search.suggestions'), hidden: '' });
  if (!fallback) list.setAttribute('role', 'listbox');
  const panel = el('div', 'listbox', '', { hidden: '' });
  const hint = el('p', 'search-hint', t('search.hint'), { id: hintId });
  const live = el('p', 'visually-hidden', '', { role: 'status', 'aria-live': 'polite' });
  root.append(label, field, list, panel, hint, live);
  container.replaceChildren(root);

  let state = { status: 'idle' };
  let handlers = {};
  let options = [];
  let titles = [];
  let active = -1;
  let open = false;

  const hasList = () => state.status === 'results' && titles.length > 0 && state.online !== false;

  function setActive(index) {
    active = index;
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
    if (index < 0) input.removeAttribute('aria-activedescendant');
    else {
      input.setAttribute('aria-activedescendant', options[index].id);
      options[index].scrollIntoView?.({ block: 'nearest' });
    }
  }

  let dismissed = false;

  function setOpen(next) {
    open = next;
    list.hidden = !(open && hasList());
    panel.hidden = !(open && !hasList() && panel.childElementCount > 0);
    if (!fallback) input.setAttribute('aria-expanded', String(!list.hidden));
    if (list.hidden) setActive(-1);
  }

  function syncClear() {
    clear.hidden = input.disabled || input.value === '';
  }

  function choose(title) {
    setOpen(false);
    handlers.onChoose?.(title);
  }

  function note(...nodes) {
    panel.replaceChildren(...nodes);
  }

  function announce(text) {
    if (live.textContent !== text) live.textContent = text;
  }

  function showStatus() {
    const { status, query = '' } = state;
    const offline = state.online === false;
    input.disabled = offline;
    field.classList.toggle('search__field--disabled', offline);
    hint.hidden = status !== 'idle' || offline;
    list.replaceChildren();
    options = [];
    titles = [];

    if (offline) {
      const body = el('p', 'listbox__note');
      body.append(el('strong', '', t('search.offline.title')), document.createElement('br'), t('search.offline.hint'));
      note(body);
      announce(t('search.offline.title'));
      return;
    }
    if (status === 'idle') {
      note();
      announce('');
    } else if (status === 'loading') {
      const rows = Array.from({ length: SKELETON_ROWS }, () => {
        const row = el('div', 'option', '', { 'aria-hidden': 'true' });
        const lines = el('span', 'option__lines');
        lines.append(el('span', 'skeleton skeleton--line skeleton--mid'), el('span', 'skeleton skeleton--line skeleton--short'));
        row.append(el('div', 'poster skeleton'), lines);
        return row;
      });
      note(el('p', 'listbox__note', t('search.loading')), ...rows);
      announce(t('search.loading'));
    } else if (status === 'empty' || (status === 'results' && !state.titles?.length)) {
      const body = el('p', 'listbox__note');
      body.append(el('strong', '', t('search.none.title', { q: query })), document.createElement('br'), t('search.none.hint'));
      note(body);
      announce(t('search.none.status'));
    } else if (status === 'error') {
      const auth = state.error?.type === 'auth';
      const body = el('div', 'listbox__note');
      const message = el('p');
      message.append(
        el('strong', '', t('search.error.title')),
        document.createElement('br'),
        t(errorTexts[state.error?.type] ?? 'search.error.default'),
      );
      const action = el('button', 'btn btn--secondary', '', { type: 'button' });
      if (auth) action.append(t('search.checkKey'));
      else action.append(icon('refresh', 'sm'), t('search.retry'));
      action.addEventListener('click', () => {
        if (auth) handlers.onCheckKey?.();
        else handlers.onRetry?.(input.value);
      });
      body.append(message, action);
      note(body);
      announce(t('search.error.title'));
    } else {
      titles = state.titles.slice(0, MAX_SUGGESTIONS);
      note();
      options = titles.map((title, index) => {
        const content = optionContent(title, index, query, state.imageConfiguration);
        let option;
        if (fallback) {
          option = el('li', 'option-item');
          const link = el('a', 'option', '', { href: handlers.hrefFor?.(title) ?? '#' });
          link.append(...content);
          link.addEventListener('click', (event) => {
            if (handlers.onChoose) event.preventDefault();
            choose(title);
          });
          option.append(link);
        } else {
          option = el('li', 'option', '', { role: 'option', id: `${id}-option-${index}`, 'aria-selected': 'false' });
          option.append(...content);
          option.addEventListener('click', () => choose(title));
        }
        return option;
      });
      list.append(...options);
      announce(t(titles.length === 1 ? 'search.count.one' : 'search.count.other', { n: titles.length }));
    }
  }

  function update(nextState, nextHandlers) {
    state = nextState;
    handlers = nextHandlers ?? handlers;
    const value = state.value ?? state.query;
    if (value !== undefined && document.activeElement !== input && input.value !== value) input.value = value;
    showStatus();
    syncClear();
    // A response that arrives after the user dismissed the list or moved on must not reopen it.
    setOpen(!dismissed && (state.status !== 'idle' || state.online === false));
  }

  function clearField() {
    input.value = '';
    dismissed = false;
    syncClear();
    handlers.onCancel?.();
  }

  // Options keep the focus in the field: a press must not blur it.
  list.addEventListener('mousedown', (event) => event.preventDefault());
  panel.addEventListener('mousedown', (event) => event.preventDefault());

  input.addEventListener('input', () => {
    dismissed = false;
    syncClear();
    handlers.onInput?.(input.value);
  });
  input.addEventListener('compositionstart', () => handlers.onCompositionStart?.());
  input.addEventListener('compositionend', () => handlers.onCompositionEnd?.(input.value));
  input.addEventListener('focus', (event) => {
    // Focus arriving from inside the widget (Escape from a link, Shift+Tab) keeps the list dismissed.
    if (!root.contains(event.relatedTarget)) dismissed = false;
    if (state.status !== 'idle' && !open && !dismissed) setOpen(true);
  });
  input.addEventListener('pointerdown', () => {
    dismissed = false;
    if (state.status !== 'idle' && !open) setOpen(true);
  });
  root.addEventListener('focusout', (event) => {
    if (root.contains(event.relatedTarget)) return;
    dismissed = true;
    setOpen(false);
  });
  clear.addEventListener('click', () => {
    clearField();
    input.focus();
  });

  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move && !fallback) {
      if (!hasList()) return;
      event.preventDefault();
      dismissed = false;
      if (!open) setOpen(true);
      const last = options.length - 1;
      if (active < 0) setActive(move > 0 ? 0 : last);
      else setActive((active + move + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active >= 0) choose(titles[active]);
      else if (input.value.trim()) handlers.onSubmit?.(input.value);
    } else if (event.key === 'Escape') {
      // The native search field clears itself on Escape: the first press only closes the popup.
      event.preventDefault();
      if (open && (state.status !== 'idle' || state.online === false)) {
        dismissed = true;
        setOpen(false);
      } else clearField();
    } else if (event.key === 'Tab' && !fallback && hasList()) {
      // Tab leaves the list; the retry and key actions stay reachable because their panel is not closed.
      dismissed = true;
      setOpen(false);
    }
  });
  // In the fallback, Escape from a link returns to the field.
  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    dismissed = true;
    setOpen(false);
    input.focus();
  });

  return {
    fallback,
    input,
    update,
    focus: () => input.focus(),
  };
}
