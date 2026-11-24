export const DEFAULT_SERVICE = 'netflix';
export const SHOW_SERVICE_LOGOS = false;

// AL-1 entries use key, name, numeric tmdbProviderId, string saServiceId,
// and verifiedBy citing evidence that both IDs identify the same service.
export const SERVICE_MAP = Object.freeze({
  [DEFAULT_SERVICE]: Object.freeze({
    key: DEFAULT_SERVICE,
    name: 'Netflix',
    tmdbProviderId: 8,
    saServiceId: 'netflix',
    verifiedBy: 'TMDB movie provider catalog fixture and Streaming Availability v4 countries fixture',
  }),
});

function isVerified(service) {
  return typeof service?.verifiedBy === 'string' && service.verifiedBy.trim() !== '';
}

function byId(field, id, map) {
  return Object.values(map).find((service) => service[field] === id && isVerified(service)) ?? null;
}

export function byTmdbId(id, map = SERVICE_MAP) {
  return byId('tmdbProviderId', id, map);
}

export function bySaId(id, map = SERVICE_MAP) {
  return byId('saServiceId', id, map);
}

export function byKey(key, map = SERVICE_MAP) {
  return byId('key', key, map);
}
