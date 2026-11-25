// Service picker of the title page: a labelled native select, so keyboard and screen readers work as is.
import { reconcileAll, reportedOffers } from '../core/reconcile.js';
import { DEFAULT_SERVICE, byKey } from '../data/services.js';
import { t } from '../i18n/strings.js';
import { el, icon, uniqueId } from './dom.js';
import { serviceLogo } from './service-logo.js';

/** Value of the "All services" entry; service keys never take this form. */
export const ALL_SERVICES = 'all';

/**
 * Services present in the title's data, the default service first (even when it has no offer, so the
 * question "is it on the default service?" always has an answer), then the others A to Z.
 * @param {Map<string, {service: {key: string, name: string}|null}>} reconciledAll Result of `reconcileAll()`.
 * @returns {{key: string, name: string, logoPath?: string}[]}
 */
export function serviceOptions(reconciledAll) {
  const present = new Map();
  for (const [key, { service }] of reconciledAll) {
    if (!service) continue;
    present.set(key, { key, name: service.name, ...(service.serviceLogoPath && { logoPath: service.serviceLogoPath }) });
  }
  const first = present.get(DEFAULT_SERVICE) ?? { key: DEFAULT_SERVICE, name: byKey(DEFAULT_SERVICE)?.name ?? DEFAULT_SERVICE };
  present.delete(DEFAULT_SERVICE);
  const others = [...present.values()].sort((a, b) => a.name.localeCompare(b.name));
  return [first, ...others];
}

/** The service to show: the stored choice when this title offers it, "all", or the default service. */
export function effectiveService(choice, options) {
  if (choice === ALL_SERVICES || options.some(({ key }) => key === choice)) return choice;
  return DEFAULT_SERVICE;
}

// The two sources name an unregistered service with their own keys: fold those that share a name into one.
function aliasesOf(reconciledAll) {
  const firstByName = new Map();
  const aliases = new Map();
  for (const [key, { service }] of reconciledAll) {
    const name = service?.name.trim().toLowerCase();
    if (!name) continue;
    if (firstByName.has(name)) aliases.set(key, firstByName.get(name));
    else firstByName.set(name, key);
  }
  return aliases;
}

/**
 * Everything the title page needs about services, derived from reconciled data only (never from a request).
 * @param {{snapshots: object[], coverage: object}} input The loaded availability.
 * @param {string|null} choice The stored preference.
 * @param {string|null} home The reference country code.
 */
export function servicesState(input, choice, home) {
  const aliases = aliasesOf(reconcileAll(input));
  const reconciledAll = reconcileAll({ ...input, aliases });
  const options = serviceOptions(reconciledAll);
  const selected = effectiveService(choice ?? DEFAULT_SERVICE, options);
  return {
    options, selected, aliases,
    all: selected === ALL_SERVICES
      ? { reconciledAll, offers: reportedOffers({ ...input, aliases }), home: home ? String(home).toLowerCase() : null }
      : null,
  };
}

/**
 * @param {{options: {key: string, name: string, logoPath?: string}[], selected: string,
 *   onChange: (key: string) => void, imageConfiguration?: object|null}} config
 * @returns {HTMLElement}
 */
export function servicePicker({ options, selected, onChange, imageConfiguration }) {
  const id = uniqueId('service');
  const box = el('div', 'service-pick');
  const wrap = el('span', 'select-wrap');
  const select = el('select', 'select', '', { id, name: id });
  for (const { key, name } of options) select.append(el('option', '', name, { value: key }));
  select.append(el('option', '', t('title.service.all'), { value: ALL_SERVICES }));
  select.value = selected;
  select.addEventListener('change', () => onChange?.(select.value));
  wrap.append(select, icon('chevDown', 'sm'));
  box.append(el('label', '', t('title.service.label'), { for: id }));
  // A native option cannot hold an image: the logo of the selected service sits beside the select.
  const current = options.find(({ key }) => key === selected);
  const logo = current && serviceLogo(current, imageConfiguration);
  if (logo) box.append(logo);
  box.append(wrap);
  return box;
}
