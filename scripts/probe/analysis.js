export function extractShape(body, dictionaries = []) {
  const fields = new Map();

  function visit(value, path) {
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!fields.has(path)) fields.set(path, new Set());
    fields.get(path).add(type);

    if (type === 'array') {
      for (const item of value) visit(item, path + '[]');
    } else if (type === 'object') {
      for (const [name, child] of Object.entries(value)) {
        const field = dictionaries.includes(path) ? '*' : JSON.stringify(name);
        visit(child, path + '[' + field + ']');
      }
    }
  }

  visit(body, '$');
  return [...fields.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([path, types]) => path + ': ' + [...types].sort().join(' | '));
}

export function tmdbServices(body) {
  return uniqueServices(Array.isArray(body?.results) ? body.results
    .filter((entry) => Number.isSafeInteger(entry?.provider_id) && typeof entry.provider_name === 'string')
    .map(({ provider_id: id, provider_name: name }) => ({ id, name })) : []);
}

export function saServices(body) {
  return uniqueServices(Object.values(body ?? {}).flatMap((country) =>
    Array.isArray(country?.services) ? country.services
      .filter((entry) => typeof entry?.id === 'string' && typeof entry.name === 'string')
      .map(({ id, name }) => ({ id, name })) : []));
}

function uniqueServices(services) {
  return [...new Map(services.map((service) => [JSON.stringify(service), service])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
}

const serviceNames = {
  Netflix: ['Netflix'],
  'Prime Video': ['Prime Video', 'Amazon Prime Video'],
  'Disney+': ['Disney+', 'Disney Plus'],
  Max: ['Max', 'HBO Max'],
  'Apple TV+': ['Apple TV+', 'Apple TV Plus'],
  'Paramount+': ['Paramount+', 'Paramount Plus'],
  Hulu: ['Hulu'],
  'Canal+': ['Canal+', 'Canal Plus', 'myCANAL'],
};

export function proposeMappings(movie, tv, sa) {
  const normalize = (name) => name.toLowerCase().replaceAll('+', ' plus').replace(/[^a-z0-9]/g, '');
  return Object.entries(serviceNames).map(([name, aliases]) => {
    const names = aliases.map(normalize);
    const matches = (services) => services.filter((service) => names.includes(normalize(service.name)));
    return { name, movie: matches(movie), tv: matches(tv), sa: matches(sa) };
  });
}

export function quotaHeaders(headers) {
  return Object.fromEntries([...headers].filter(([name]) => /limit|quota|remaining/i.test(name)));
}

function remainingCount(headers, name) {
  const raw = headers[name];
  return /^\d+$/.test(raw ?? '') && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
}

export function compareQuota(before, countries, after) {
  return Object.keys(before).filter((name) => /remaining/i.test(name)).flatMap((name) => {
    const start = remainingCount(before, name);
    const end = remainingCount(after, name);
    if (start === undefined || end === undefined) return [];
    const middle = remainingCount(countries, name);
    const bracketDelta = start - end;
    const countriesDelta = middle === undefined ? undefined : start - middle;
    const estimate = bracketDelta - 1;
    return [{
      name, bracketDelta, countriesDelta,
      estimate: estimate >= 0 && (countriesDelta === undefined || countriesDelta === estimate)
        ? estimate : undefined,
    }];
  });
}

export function maskKeys(text, keys) {
  const alternatives = keys.filter(Boolean).sort((a, b) => b.length - a.length)
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return alternatives.length ? text.replace(new RegExp(alternatives.join('|'), 'g'), '[redacted]') : text;
}
