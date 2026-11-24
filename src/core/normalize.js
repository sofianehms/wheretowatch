import { bySaId, byTmdbId } from '../data/services.js';

const offerTypes = new Map([
  ['tmdb', new Map([
    ['flatrate', 'subscription'],
    ['ads', 'free'],
    ['free', 'free'],
    ['rent', 'rent'],
    ['buy', 'buy'],
  ])],
  ['sa', new Map([
    ['subscription', 'subscription'],
    ['free', 'free'],
    ['rent', 'rent'],
    ['buy', 'buy'],
    // An add-on requires a subscription to the add-on channel.
    ['addon', 'subscription'],
  ])],
]);

const serviceLookups = new Map([
  ['tmdb', byTmdbId],
  ['sa', bySaId],
]);

/** Normalize an alpha-2 country code. Return null for malformed codes. */
export function country(code) {
  const value = typeof code === 'string' ? code.trim() : '';
  return /^[a-zA-Z]{2}$/.test(value) ? value.toLowerCase() : null;
}

/** Return the common offer type, or null for an unmapped value. */
export function offerType(source, raw) {
  return offerTypes.get(source)?.get(raw) ?? null;
}

/** Resolve a registered service or keep the source's identity and display name. */
export function serviceKey(source, rawId, rawName, map) {
  const lookup = serviceLookups.get(source);
  if (!lookup || rawId == null || rawId === '') return null;

  const service = lookup(rawId, map);
  if (service) return { key: service.key, name: service.name };
  return { key: `${source}:${rawId}`, name: rawName };
}
