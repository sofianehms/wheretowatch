// Title page states, built from the reconcile datasets (#16) run through reconcile() and computeVerdict().
import { HttpError } from '../../src/api/http.js';
import { reconcile } from '../../src/core/reconcile.js';
import { computeVerdict } from '../../src/core/verdict.js';
import { renderTitle } from '../../src/render/title.js';
import {
  disagreement, divergingTypes, outsideSaCoverage, saAbsent, saNotRecognized,
} from '../fixtures/reconcile/scenarios.js';

const movie = {
  mediaType: 'movie', tmdbId: 11, imdbId: null, title: 'Harbour Lights', year: 2023, posterPath: null, ref: 'movie/11',
};
const series = { ...movie, mediaType: 'tv', tmdbId: 13, title: 'Paper Moons', year: 2021, ref: 'tv/13' };
const longTitle = {
  ...movie,
  title: 'The Extraordinarily Long and Winding Chronicle of the Harbour Lights Keeper and the Seventeen Lighthouses',
};

// A wide dataset: both sources cover many countries, so the "Show more" control and the badges appear.
const wide = (() => {
  const codes = ['fr', 'ca', 'de', 'us', 'gb', 'jp', 'it', 'es', 'nl', 'se', 'no', 'dk', 'fi', 'pl', 'pt', 'ie', 'au', 'nz', 'br', 'mx', 'ar', 'cl'];
  // Covered by both sources but without a Netflix offer: the reference country that is not found.
  const withoutOffer = 'cl';
  const offer = (source, country, offerType = 'subscription', link = null) => ({
    source, country, serviceKey: 'netflix', serviceName: 'Netflix', serviceLogoPath: null, offerType, link,
    quality: null, expiresOn: null, languages: [],
  });
  const snapshot = (source, offers) => ({
    source, status: 'offers', fetchedAt: source === 'tmdb' ? '2026-11-21T12:00:00Z' : '2026-11-22T12:00:00Z',
    coveredCountries: null, offers, error: null,
  });
  return {
    coverage: { tmdb: { status: 'fresh', countries: codes }, sa: { status: 'fresh', countries: codes.filter((code) => code !== 'ar') } },
    snapshots: [
      snapshot('tmdb', [...codes.filter((code) => code !== withoutOffer).map((code) => offer('tmdb', code)), offer('tmdb', 'fr', 'rent'), offer('tmdb', 'de', 'free')]),
      snapshot('sa', [
        ...codes.slice(0, 15).map((code) => offer('sa', code, 'subscription', code === 'fr' ? 'https://www.netflix.com/title/80000001' : null)),
        offer('sa', 'jp', 'rent'),
      ]),
    ],
  };
})();

function compute(input, { serviceKey = 'netflix', homeCountry = 'FR', mediaType = 'movie' } = {}) {
  const reconciled = reconcile({ ...input, serviceKey });
  const verdict = computeVerdict({ reconciled, snapshots: input.snapshots, serviceKey, homeCountry, mediaType });
  return { reconciled, verdict };
}

function failing(input, type) {
  return { ...input, snapshots: input.snapshots.map((snapshot) => ({ ...snapshot, status: 'unavailable', offers: [], error: new HttpError(type) })) };
}

const handlers = (log) => ({ onRetry: () => log.push('retry'), onCheckKeys: () => log.push('keys') });
// Nothing may stick out of the container; the hero fade is a decorative pseudo-element and is not measured.
function checkFits(container) {
  const edge = container.getBoundingClientRect().right;
  const wide = [...container.querySelectorAll('*')].find((node) => node.getBoundingClientRect().right > edge + 1);
  return wide ? [`<${wide.localName} class="${wide.getAttribute('class') ?? ''}"> sticks out of its container`] : [];
}
const text = (container, selector) => container.querySelector(selector)?.textContent ?? '';
const countPattern = /\b\d[\d,]* (?:covered )?(?:country|countries)\b/;
const datePattern = /\b\d{1,2} [A-Z][a-z]{2} 2026/;

// The verdict is announced through a polite status region that holds the verdict card.
function checkLive(container) {
  const live = container.querySelector('[role="status"][aria-live="polite"]');
  if (!live) return ['no polite status region'];
  return live.querySelector('.verdict') ? [] : ['the verdict is not inside the polite status region'];
}

const dateOf = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const SOURCE_NAMES = { tmdb: 'JustWatch via TMDB', sa: 'Movie of the Night' };

// Each verdict names its source(s), each with its own retrieval date from the fixture, and the exact
// number of countries whenever the count is known.
function checkVerdictContent(container, verdict) {
  const card = container.querySelector('.verdict');
  const shown = card.textContent;
  const full = `${shown} ${text(container, '.data-note')}`;
  const problems = [];
  const responding = verdict.perSourceNotes.filter(({ status }) => status !== 'unavailable');
  const known = responding.filter(({ status }) => status === 'offers' || status === 'empty');
  const named = verdict.kind === 'insufficient' || known.length === 0 ? responding : known;
  if (named.length === 0) problems.push('the fixture has no responding source');
  for (const { source, fetchedAt } of named) {
    const name = SOURCE_NAMES[source];
    const date = dateOf(fetchedAt);
    const pair = verdict.kind === 'insufficient'
      ? [...card.querySelectorAll('li')].some((item) => item.textContent.startsWith(`${name}:`) && item.textContent.includes(date))
      : shown.includes(`${name}, ${date}`);
    if (!pair) problems.push(`the verdict does not show ${name} with its date ${date}`);
  }
  for (const { source } of verdict.perSourceNotes.filter((note) => !named.includes(note))) {
    if (verdict.kind !== 'insufficient' && new RegExp(`${SOURCE_NAMES[source]}, \\d`).test(shown)) problems.push(`${SOURCE_NAMES[source]} is dated as a reporting source`);
  }
  const counted = verdict.kind === 'insufficient' ? shown : text(container, '.verdict__headline');
  if (verdict.count !== null) {
    const exact = new RegExp(`\\b${verdict.count} (?:covered )?countr(?:y|ies)\\b`);
    if (!exact.test(counted)) problems.push(`the verdict does not show the ${verdict.count} countries`);
  } else if (countPattern.test(counted)) problems.push('the verdict shows a count despite unknown coverage');
  // Each answering source carries its contractual notice, and only that source.
  const noteText = text(container, '.data-note');
  const night = container.querySelector('.data-note a[href="https://www.movieofthenight.com/about/api"]');
  for (const [id, shownNotice] of [['tmdb', noteText.includes('Availability data: JustWatch')], ['sa', Boolean(night)]]) {
    const answered = responding.some(({ source }) => source === id);
    if (answered !== shownNotice) problems.push(`the ${id} attribution notice is ${shownNotice ? 'shown without' : 'missing for'} its data`);
  }
  if (night && !noteText.includes('Streaming availability information is provided by Streaming Availability API by Movie of the Night')) problems.push('the Movie of the Night notice wording differs');
  if (/\b(nowhere|never)\b/i.test(full)) problems.push('forbidden wording');
  return problems;
}

const iconOf = (node) => node.querySelector('svg path')?.getAttribute('d');

function scenario(name, state, { handlersLog = false, verify = () => [], expected = {}, skipContent = false } = {}) {
  return {
    name,
    render(container) {
      container.log = [];
      renderTitle(container, state, handlersLog ? handlers(container.log) : {});
    },
    check(container) {
      const problems = [...checkLive(container), ...checkFits(container), ...verify(container)];
      if (!skipContent) {
        problems.push(...checkVerdictContent(container, state.verdict));
        // The fixture totals are restated literally, so a wrong computation cannot pass unnoticed.
        if ('count' in expected && state.verdict.count !== expected.count) problems.push(`expected ${expected.count} countries, computed ${state.verdict.count}`);
      }
      return problems;
    },
  };
}

const result = (input, options, title = movie) => ({ status: 'result', title, ...compute(input, options) });

const has = (container, selector, label) => (container.querySelector(selector) ? [] : [`${label} is missing`]);

// "Confirmed" and "diverging" must differ by label and by icon, so grayscale is enough to tell them apart.
function checkBadges(container) {
  const confirmed = container.querySelector('.badge--confirmed');
  const disagree = container.querySelector('.badge--disagree');
  if (!confirmed || !disagree) return ['a confirmed and a diverging badge are both expected'];
  const problems = [];
  if (confirmed.textContent === disagree.textContent) problems.push('the two badges share the same label');
  if (iconOf(confirmed) === iconOf(disagree)) problems.push('the two badges share the same icon');
  for (const badge of [confirmed, disagree]) {
    if (!badge.textContent.trim() || !badge.querySelector('svg')) problems.push('a badge lacks its label or icon');
  }
  return problems;
}


// Languages: one country per case, all from the second source.
const track = (kind, language, closedCaptions = false, region = null) => ({ kind, language, region, closedCaptions });
const withLanguages = (country, languages) => ({
  source: 'sa', country, serviceKey: 'netflix', serviceName: 'Netflix', serviceLogoPath: null, offerType: 'subscription', link: null,
  quality: null, expiresOn: null, languages,
});
const tmdbOffer = (country) => ({ ...withLanguages(country, []), source: 'tmdb' });
const dated = (source, offers) => ({
  source, status: 'offers', fetchedAt: source === 'tmdb' ? '2026-11-21T12:00:00Z' : '2026-11-22T12:00:00Z', coveredCountries: null, offers, error: null,
});
const manySubtitles = ['eng', 'fra', 'deu', 'spa', 'ita', 'por', 'jpn', 'kor', 'zho', 'tha', 'ind', 'nld'];
const languagesInput = {
  coverage: { tmdb: { status: 'fresh', countries: ['jp', 'ca', 'de', 'fr', 'us', 'br'] }, sa: { status: 'fresh', countries: ['jp', 'ca', 'de', 'fr', 'br'] } },
  snapshots: [
    dated('tmdb', ['jp', 'ca', 'de', 'fr', 'us', 'br'].map(tmdbOffer)),
    dated('sa', [
      withLanguages('jp', [track('audio', 'jpn'), track('audio', 'eng'), track('audio', 'fra'),
        ...manySubtitles.flatMap((code) => [track('subtitle', code)]), track('subtitle', 'jpn', true), track('subtitle', 'eng', true)]),
      withLanguages('ca', [track('subtitle', 'fra'), track('subtitle', 'eng')]),
      withLanguages('de', []),
      withLanguages('fr', [track('audio', 'fra')]),
      withLanguages('br', [track('audio', 'por', false, 'BR')]),
    ]),
  ],
};
// Eight countries, the first with twelve subtitles: the "Show more" cutoff must only count country rows.
const manyCountries = (() => {
  const codes = ['au', 'at', 'be', 'br', 'ca', 'de', 'fr', 'jp'];
  return {
    coverage: { tmdb: { status: 'fresh', countries: codes }, sa: { status: 'fresh', countries: codes } },
    snapshots: [
      dated('tmdb', codes.map(tmdbOffer)),
      dated('sa', codes.map((code, index) => withLanguages(code, index === 0 ? manySubtitles.map((language) => track('subtitle', language)) : [track('audio', 'eng')]))),
    ],
  };
})();
// The second source answers with no offer and its fresh list leaves out the United States.
const uncoveredInput = {
  coverage: { tmdb: { status: 'fresh', countries: ['us', 'fr'] }, sa: { status: 'fresh', countries: ['fr'] } },
  snapshots: [
    dated('tmdb', ['us', 'fr'].map(tmdbOffer)),
    { source: 'sa', status: 'empty', fetchedAt: '2026-11-22T12:00:00Z', coveredCountries: null, offers: [], error: null },
  ],
};
const rowOf = (container, name) => [...container.querySelectorAll('.country')].find((node) => node.querySelector('.country__name')?.firstChild.textContent === name);

function openLanguages(container, name) {
  const row = rowOf(container, name);
  if (!row) return { problems: [`${name} is missing`] };
  const toggle = row.querySelector('.country__toggle');
  const panel = row.querySelector('.langs');
  const problems = [];
  if (toggle.getAttribute('aria-expanded') !== 'false' || !panel.hidden) problems.push(`${name} is not collapsed at first`);
  if (toggle.getAttribute('aria-controls') !== panel.id) problems.push(`${name}: the toggle does not control its panel`);
  toggle.click();
  if (toggle.getAttribute('aria-expanded') !== 'true' || panel.hidden) problems.push(`${name} does not open`);
  return { problems, toggle, panel };
}

const closeLanguages = ({ toggle, panel }, name) => {
  toggle.click();
  return toggle.getAttribute('aria-expanded') === 'false' && panel.hidden ? [] : [`${name} does not close`];
};

const scenarios = [
  scenario('Title · loading', { status: 'loading', title: movie }, {
    skipContent: true,
    verify(container) {
      const problems = [];
      const live = container.querySelector('[role="status"][aria-live="polite"]');
      if (!live?.textContent.includes('Checking availability')) problems.push('the loading text is not announced');
      if (live?.querySelector('[aria-busy="true"]') === null) problems.push('the loading card is not marked busy');
      return problems;
    },
  }),
  scenario('Title · available, both sources, reference country first', result(wide), {
    verify(container) {
      const problems = [...checkBadges(container)];
      if (!container.querySelector('.home')) problems.push('the reference country line is missing');
      else if (!/France/.test(text(container, '.home')) || !/On Netflix/.test(text(container, '.home'))) problems.push('the reference country verdict is wrong');
      if (container.querySelector('.verdict').firstElementChild !== container.querySelector('.home')) problems.push('the reference country is not the first line of the verdict');
      const titles = [...container.querySelectorAll('.group__title')].map((node) => node.textContent);
      for (const expected of ['Subscription', 'Free with ads', 'Rent']) if (!titles.includes(expected)) problems.push(`the ${expected} group is missing`);
      if (!/Show \d+ more/.test(text(container, '.more'))) problems.push('the show-more control is missing');
      const more = container.querySelector('.more');
      const hiddenBefore = container.querySelectorAll('.countries li[hidden]').length;
      more.click();
      if (more.getAttribute('aria-expanded') !== 'true' || container.querySelectorAll('.countries li[hidden]').length >= hiddenBefore) problems.push('the show-more control does not reveal the countries');
      more.click();
      if (container.querySelectorAll('.countries li[hidden]').length !== hiddenBefore) problems.push('the show-fewer control does not collapse the list');
      const names = [...container.querySelectorAll('.group:first-of-type .country__name')].map((node) => node.firstChild.textContent);
      if (names.join('|') !== [...names].sort((a, b) => a.localeCompare(b)).join('|')) problems.push('the countries are not listed A to Z');
      problems.push(...has(container, '.data-note a[href^="https://www.themoviedb.org/movie/11"]', 'the TMDB link'));
      problems.push(...has(container, '.data-note a[href^="https://www.netflix.com/"]', 'the direct service link'));
      problems.push(...has(container, '.covered', 'the list of covered countries'));
      return problems;
    },
  }),
  scenario('Title · available, reference country not found', result(wide, { homeCountry: 'CL' }), {
    verify: (container) => /Not on Netflix/.test(text(container, '.home')) ? [] : ['the reference country is not reported as absent'],
  }),
  scenario('Title · sources disagree', result(disagreement), {
    verify(container) {
      const problems = [];
      if (!container.querySelector('.badge--disagree')) problems.push('the diverging badge is missing');
      if (!/Subscription \(JustWatch via TMDB\)/.test(text(container, '.country:has(.badge--disagree)'))) problems.push('the reporting source is not named');
      return problems;
    },
  }),
  scenario('Title · both sources, different offer types', result(divergingTypes), {
    verify: (container) => /Subscription \(JustWatch via TMDB\)/.test(text(container, '.country')) && /Rent \(Movie of the Night\)/.test(text(container, '.country')) ? [] : ['the offer types are not listed per source'],
  }),
  scenario('Title · only one source reports the country', result(outsideSaCoverage), {
    verify: (container) => /JustWatch via TMDB only/.test(text(container, '.badge')) ? [] : ['the single-source badge is missing'],
  }),
  scenario('Title · not found on the service', result(disagreement, { serviceKey: 'Hulu' }), {
    verify(container) {
      const problems = [];
      if (!/Not found on Hulu in the 3 covered countries/.test(text(container, '.verdict__headline'))) problems.push('the not-found headline is wrong');
      if (!/may be available elsewhere/.test(text(container, '.verdict'))) problems.push('the coverage limit is not stated');
      return problems;
    },
  }),
  scenario('Title · not recognized by the second source', result(saNotRecognized), {
    verify: (container) => /Second source: title not recognized/.test(text(container, '.banner')) ? [] : ['the not-recognized notice is missing'],
  }),
  scenario('Title · insufficient data', result({
    ...saNotRecognized, snapshots: [{ ...saNotRecognized.snapshots[0], status: 'empty', offers: [] }, saNotRecognized.snapshots[1]],
  }), {
    verify(container) {
      const problems = [];
      if (!/Not enough data to conclude/.test(text(container, '.verdict__headline'))) problems.push('the insufficient headline is wrong');
      problems.push(...has(container, '.verdict a[href^="https://www.themoviedb.org/"]', 'the TMDB check link'));
      return problems;
    },
    expected: { count: 2 },
  }),
  scenario('Title · coverage from an old (dated) list', result({
    ...disagreement, snapshots: [disagreement.snapshots[0], { ...disagreement.snapshots[1], stale: true }],
  }), {
    verify(container) {
      const notice = text(container, '.banner');
      return /Coverage from an older list/.test(notice) && /18 Nov 2026/.test(notice) ? [] : ['the dated coverage notice is missing'];
    },
  }),
  scenario('Title · coverage of an unknown source', result({
    ...disagreement, coverage: { ...disagreement.coverage, sa: { status: 'unknown' } },
  }), {
    expected: { count: null },
    verify(container) {
      const problems = [];
      if (!/Coverage of a source unknown/.test(text(container, '.banner'))) problems.push('the unknown coverage notice is missing');
      if (countPattern.test(text(container, '.verdict__headline'))) problems.push('a country count is shown');
      return problems;
    },
  }),
  scenario('Title · series, one source', result(saAbsent, { mediaType: 'tv' }, series), {
    verify: (container) => /Whole series, not per season/.test(text(container, '.title-head__meta')) ? [] : ['the series scope is not stated'],
  }),
  scenario('Title · long title', result(wide, {}, longTitle)),
  scenario('Title · languages, complete and about ten subtitles (overflow)', result(languagesInput), {
    verify(container) {
      const opened = openLanguages(container, 'Japan');
      const problems = [...opened.problems];
      const lists = [...opened.panel.querySelectorAll('dt')].map((node) => node.textContent);
      if (lists.join() !== 'Audio,Subtitles') problems.push('the Audio and Subtitles lists are missing');
      const audio = [...opened.panel.querySelectorAll('.langs__list > div:nth-child(1) li')].map((node) => node.textContent);
      if (audio.join() !== 'English,French,Japanese') problems.push(`audio languages are wrong: ${audio}`);
      const subtitles = [...opened.panel.querySelectorAll('.langs__list > div:nth-child(2) li')].map((node) => node.textContent);
      if (subtitles.length !== 14 || !subtitles.includes('Japanese (SDH)') || subtitles.indexOf('Japanese') + 1 !== subtitles.indexOf('Japanese (SDH)')) problems.push('subtitles or their SDH variants are wrong');
      if (!/deaf and hard of hearing/.test(opened.panel.textContent)) problems.push('the SDH note is missing');
      const brazil = openLanguages(container, 'Brazil');
      if (!/Brazilian Portuguese/.test(brazil.panel?.textContent ?? '')) problems.push('the regional variant is not named');
      problems.push(...closeLanguages(brazil, 'Brazil'));
      // Left open for the screenshots: the longest list is the one that must not overflow.
      return problems;
    },
  }),
  scenario('Title · languages, subtitles only', result(languagesInput), {
    verify(container) {
      const opened = openLanguages(container, 'Canada');
      const text = opened.panel?.textContent ?? '';
      const problems = [...opened.problems];
      if (!/Audio\s*None listed/.test(text) || !/FrenchEnglish|English.*French/.test(text)) problems.push('subtitles without audio are not shown');
      if (/deaf and hard/.test(text)) problems.push('an SDH note shows without SDH subtitles');
      problems.push(...closeLanguages(opened, 'Canada'));
      return problems;
    },
  }),
  scenario('Title · languages missing', result(languagesInput), {
    verify(container) {
      const opened = openLanguages(container, 'Germany');
      const problems = [...opened.problems];
      if (!/Languages not provided by the source/.test(opened.panel?.textContent ?? '')) problems.push('the missing-languages note is absent');
      return problems;
    },
  }),
  scenario('Title · languages, country outside second-source coverage', result(languagesInput), {
    verify(container) {
      const opened = openLanguages(container, 'United States');
      const problems = [...opened.problems];
      if (!/Second source: country not covered/.test(opened.panel?.textContent ?? '')) problems.push('the uncovered-country note is absent');
      if (opened.panel?.querySelector('dl')) problems.push('languages are shown for an uncovered country');
      return problems;
    },
  }),
  scenario('Title · languages, show fewer keeps the language entries', result(manyCountries), {
    verify(container) {
      const problems = [];
      const opened = openLanguages(container, 'Australia');
      problems.push(...opened.problems);
      const entries = () => container.querySelectorAll('.langs li:not([hidden])').length;
      const rows = () => [...more.closest('.group').querySelectorAll('.countries > li')].filter((node) => !node.hidden).length;
      const more = container.querySelector('.more');
      const before = entries();
      more.click();
      if (rows() !== 8) problems.push(`expected 8 country rows once expanded, saw ${rows()}`);
      more.click();
      if (rows() !== 6) problems.push(`expected 6 country rows once collapsed, saw ${rows()}`);
      if (entries() !== before) problems.push(`language entries changed from ${before} to ${entries()} after show more and show fewer`);
      if (opened.panel.hidden) problems.push('the open language panel closed');
      return problems;
    },
  }),
  scenario('Title · languages, known uncovered country with an empty second-source answer', result(uncoveredInput), {
    verify(container) {
      const opened = openLanguages(container, 'United States');
      const note = opened.panel?.textContent ?? '';
      return [...opened.problems, ...(/Second source: country not covered/.test(note) ? [] : [`wrong note: ${note}`])];
    },
  }),
  scenario('Title · languages, keyboard', result(languagesInput), {
    verify(container) {
      const toggle = rowOf(container, 'France')?.querySelector('button');
      if (!toggle || toggle.localName !== 'button') return ['the country toggle is not a native button'];
      if (toggle.tabIndex < 0) return ['the toggle is not focusable'];
      toggle.focus();
      // A native button turns Enter and Space into a click; the click is what opens and closes the panel.
      const problems = [];
      if (document.activeElement !== toggle) problems.push('the toggle does not take the focus');
      const panel = document.getElementById(toggle.getAttribute('aria-controls'));
      toggle.click();
      if (toggle.getAttribute('aria-expanded') !== 'true' || panel.hidden) problems.push('activation does not open the panel');
      toggle.click();
      if (toggle.getAttribute('aria-expanded') !== 'false' || !panel.hidden) problems.push('a second activation does not close the panel');
      return problems;
    },
  }),
  scenario('Title · error, keys refused', { status: 'result', title: movie, ...compute(failing(disagreement, 'auth')) }, {
    handlersLog: true,
    skipContent: true,
    verify(container) {
      const problems = [];
      const buttons = [...container.querySelectorAll('.verdict .btn')];
      if (!/Check my keys/.test(buttons[0]?.textContent) || !buttons[0].classList.contains('btn--primary')) problems.push('"Check my keys" is not the primary action');
      buttons[0]?.click();
      buttons[1]?.click();
      if (container.log.join() !== 'keys,retry') problems.push('the error actions do not call their handlers');
      if (!/No availability data was retrieved/.test(text(container, '.verdict'))) problems.push('the missing retrieval is not explained');
      return problems;
    },
  }),
  scenario('Title · error, network', { status: 'result', title: movie, ...compute(failing(disagreement, 'network')) }, {
    handlersLog: true,
    skipContent: true,
    verify(container) {
      const buttons = [...container.querySelectorAll('.verdict .btn')];
      container.querySelector('.btn')?.click();
      return buttons.length === 1 && container.log.join() === 'retry' ? [] : ['"Try again" is not the single action'];
    },
  }),
];

export default scenarios;
