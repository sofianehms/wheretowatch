// Banners: the notices of `state.banners`, drawn in one status region.
// An entry is `{ message, title?, tone?, icon?, action?: { label, name }, dismissible? }`.
import { formatDate, formatNumber, formatResetDate, t } from '../i18n/strings.js';
import { el, icon } from './dom.js';

const drawn = new WeakMap();

export const tmdbOnlyBanner = () => ({
  type: 'tmdbOnly',
  title: t('banners.tmdbOnly.title'),
  message: t('banners.tmdbOnly.text'),
  action: { label: t('banners.tmdbOnly.action'), name: 'settings' },
});

export const DEGRADATION_TYPES = new Set(['quotaReached', 'quotaWarning', 'sourceError']);

const caution = (type, title, message, extra) => ({ type, tone: 'caution', title, message, ...extra });
const settingsAction = (key) => ({ action: { label: t(key), name: 'settings' } });

// Only a saved answer with offers carries languages worth announcing.
const savedLanguages = (sa) => (sa?.stale && sa.offers.length > 0 ? formatDate(new Date(sa.fetchedAt)) : null);

function quotaBanner(quota, sa, answered) {
  if (quota.blocked) {
    const reset = formatResetDate(quota.nextReset);
    const date = answered ? savedLanguages(sa) : null;
    const key = date ? 'saved' : answered && sa?.status === 'unavailable' ? 'noLanguages' : 'paused';
    return caution('quotaReached', t('banners.quotaReached.title'), t(`banners.quotaReached.${key}`, { date, reset }), { icon: 'gauge' });
  }
  if (!quota.warn) return null;
  const title = t('banners.quotaWarning.title', { used: formatNumber(quota.used), limit: formatNumber(quota.limit) });
  return caution('quotaWarning', title, t('banners.quotaWarning.text', { date: formatResetDate(quota.nextReset) }),
    { icon: 'gauge', ...settingsAction('banners.quotaWarning.action') });
}

function sourceErrorBanner(tmdb, sa, blocked) {
  const stale = tmdb?.stale === true;
  // A reached limit has its own banner; a cancelled request is not a failure.
  const error = sa?.status === 'unavailable' ? sa.error?.type : null;
  const saStale = Boolean(sa?.stale) && sa.reason !== 'quota';
  const saFailed = saStale || (Boolean(error) && error !== 'aborted' && !(blocked && error === 'quota'));
  if (stale && saFailed) {
    return caution('sourceError', t('banners.sourceError.both.title'), t('banners.sourceError.both.text'));
  }
  if (stale) {
    const date = formatDate(new Date(tmdb.fetchedAt));
    return caution('sourceError', t('banners.sourceError.tmdb.title'), t('banners.sourceError.tmdb.text', { date }));
  }
  if (!saFailed) return null;
  if (error === 'auth') {
    return caution('sourceError', t('banners.sourceError.key.title'), t('banners.sourceError.key.text'),
      settingsAction('banners.sourceError.key.action'));
  }
  const date = savedLanguages(sa);
  return caution('sourceError', t('banners.sourceError.sa.title'),
    t(`banners.sourceError.sa.${date ? 'saved' : 'text'}`, { date }));
}

/**
 * Quota and source failure notices.
 * @param {object} input
 * @param {ReturnType<ReturnType<typeof import('../api/quota.js').createQuota>['status']>|null} [input.quota]
 *   Null without a key for the second source.
 * @param {ReadonlyArray<import('../api/sources.js').SourceSnapshot>|null} [input.snapshots] Of the title on screen.
 */
export function degradationBanners({ quota = null, snapshots = null }) {
  const tmdb = snapshots?.find(({ source }) => source === 'tmdb');
  const sa = snapshots?.find(({ source }) => source === 'sa');
  // Without a TMDB answer the page shows its own error: nothing is "shown" to describe.
  const answered = Boolean(tmdb) && tmdb.status !== 'unavailable';
  return [
    quota && quotaBanner(quota, sa, answered),
    answered && sourceErrorBanner(tmdb, quota ? sa : null, Boolean(quota?.blocked)),
  ].filter(Boolean);
}

function drawBanner(banner, { onAction, onDismiss }) {
  const { title, message, tone, action, dismissible } = banner;
  const body = el('div', '', title ? '' : message);
  if (title) body.append(el('span', 'banner__title', title), message);
  if (action) {
    const open = el('button', 'link', action.label, { type: 'button' });
    open.addEventListener('click', () => onAction?.(action.name, banner));
    body.append(' ', el('span', 'banner__actions'));
    body.lastChild.append(open);
  }
  const box = el('div', tone ? `banner banner--${tone}` : 'banner');
  box.append(icon(banner.icon ?? (tone ? 'alert' : 'info')), body);
  if (dismissible) {
    const close = el('button', 'icon-btn', '', { type: 'button', 'aria-label': t('banners.dismiss') });
    close.append(icon('close'));
    close.addEventListener('click', () => onDismiss?.(banner));
    box.append(close);
  }
  return box;
}

/**
 * Redraws only for a new list, so keyboard focus survives unrelated store updates.
 * @param {Element} slot Stays in the page so that changes are announced.
 * @param {ReadonlyArray<object>} banners
 * @param {{onAction?: (name: string, banner: object) => void, onDismiss?: (banner: object) => void}} [handlers]
 */
export function renderBanners(slot, banners, handlers = {}) {
  slot.setAttribute('role', 'status');
  slot.className = 'banners';
  if (drawn.get(slot) === banners) return;
  drawn.set(slot, banners);
  slot.replaceChildren(...banners.map((banner) => drawBanner(banner, handlers)));
}
