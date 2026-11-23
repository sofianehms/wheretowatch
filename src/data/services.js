export const DEFAULT_SERVICE = 'netflix';
export const SHOW_SERVICE_LOGOS = false;

export const SERVICE_MAP = Object.freeze({
  [DEFAULT_SERVICE]: Object.freeze({
    key: DEFAULT_SERVICE,
    name: 'Netflix',
    tmdbProviderId: 8,
    saServiceId: 'netflix',
    verifiedBy: 'TMDB movie provider catalog fixture and Streaming Availability v4 countries fixture',
  }),
});

const services = Object.values(SERVICE_MAP);

export function byTmdbId(id) {
  return services.find(({ tmdbProviderId }) => tmdbProviderId === id) ?? null;
}

export function bySaId(id) {
  return services.find(({ saServiceId }) => saServiceId === id) ?? null;
}

export function byKey(key) {
  return Object.hasOwn(SERVICE_MAP, key) ? SERVICE_MAP[key] : null;
}
