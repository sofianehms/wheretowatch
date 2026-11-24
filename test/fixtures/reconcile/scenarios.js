function offer(source, country, serviceKey = 'netflix', offerType = 'subscription') {
  return { source, country, serviceKey, offerType };
}

function snapshot(source, offers, status = 'offers') {
  return {
    source,
    status,
    fetchedAt: source === 'tmdb' ? '2026-11-21T12:00:00Z' : '2026-11-22T12:00:00Z',
    coveredCountries: null,
    offers,
    error: null,
  };
}

const coverage = {
  tmdb: { status: 'fresh', countries: ['fr', 'ca'] },
  sa: { status: 'stale', countries: ['fr', 'CA', 'de'], fetchedAt: '2026-11-18T12:00:00Z' },
};

const tmdb = snapshot('tmdb', [offer('tmdb', 'fr'), offer('tmdb', 'ca', 'tmdb:9902')]);

export const disagreement = {
  coverage,
  snapshots: [tmdb, snapshot('sa', [offer('sa', 'fr', 'sa:lantern'), offer('sa', 'de')])],
};

export const divergingTypes = {
  coverage,
  snapshots: [tmdb, snapshot('sa', [offer('sa', 'fr', 'netflix', 'rent')])],
};

export const outsideSaCoverage = {
  coverage: { ...coverage, sa: { status: 'fresh', countries: ['de'] } },
  snapshots: [tmdb, snapshot('sa', [], 'empty')],
};

export const saAbsent = {
  coverage: { tmdb: coverage.tmdb },
  snapshots: [tmdb],
};

export const saNotRecognized = {
  coverage,
  snapshots: [tmdb, snapshot('sa', [], 'notFound')],
};
