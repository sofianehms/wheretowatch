// Reference-country selector of Settings. Loaded on demand: it needs the network for the country list.
import country from '../i18n/en/country.js';
import { countryName } from '../i18n/strings.js';
import { el, icon, uniqueId } from './dom.js';

// Own strings: the dictionary ships with this module, outside the offline shell.
const t = (key) => country[key.replace('country.', '')];

/**
 * @param {object} options
 * @param {ReturnType<typeof import('../settings/keys.js').createSettings>} options.settings
 * @param {{activeSources: {listCoveredCountries: (options?: object) => string[]|Promise<string[]>}[]}} options.sources Active sources; the list is the union of the countries they cover.
 * @param {(country: string) => void} options.onCountryChange
 * @returns {HTMLElement} The section, with `refresh()` to re-read the active sources (a key was saved or removed).
 */
export function renderCountry({ settings, sources, onCountryChange }) {
  const doc = document;
  // The select styles live with the title page styles, which load only when needed (once per page).
  const href = new URL('../styles/title.css', import.meta.url).href;
  if (![...(doc.head?.querySelectorAll('link[rel="stylesheet"]') ?? [])].some((l) => l.href === href)) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head?.append(link);
  }
  const countryId = uniqueId('settings-country');
  const selectId = `${countryId}-select`;
  const countryHelpId = `${countryId}-help`;
  const section = el('section', '', '', { 'aria-labelledby': countryId });
  const wrap = el('div', 'select-wrap select-wrap--block');
  const select = el('select', 'select', '', { id: selectId, name: selectId, 'aria-describedby': countryHelpId });
  const countryLabel = el('label', 'visually-hidden', t('country.label'), { for: selectId });
  select.disabled = true;
  select.append(el('option', '', t('country.loading'), { value: '' }));
  wrap.append(select, icon('chevDown', 'sm'));
  const countryNote = el('p', 'key-state key-state--bad', '', { role: 'status' });
  countryNote.hidden = true;
  const showCountryNote = (key) => {
    countryNote.replaceChildren(icon('alert', 'sm'), t(key));
    countryNote.hidden = false;
  };
  // A failing source adds no country; the union is of lowercase codes.
  async function listCountries() {
    const lists = await Promise.allSettled(sources.activeSources.map((source) => source.listCoveredCountries()));
    const codes = lists.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    return [...new Set(codes.map((code) => String(code).toLowerCase()))];
  }
  const current = () => settings.getPref('country');
  function fillCountries(codes, failed) {
    // The saved country always stays selectable, even when no source lists it.
    const all = [...new Set([...codes, current()].filter(Boolean))]
      .map((code) => ({ code, name: countryName(code.toUpperCase()) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    select.replaceChildren(...all.map(({ code, name }) => el('option', '', name, { value: code })));
    select.value = current();
    select.disabled = false;
    if (failed) showCountryNote('country.unavailable');
  }
  // Only the latest request may fill the list, so a slow earlier answer never overwrites a fresher one.
  let request = 0;
  function refresh() {
    const mine = ++request;
    listCountries().then((codes) => codes, () => null).then((codes) => {
      if (mine !== request || !section.isConnected) return;
      countryNote.hidden = true;
      const keep = select.value;
      fillCountries(codes ?? [], codes === null || codes.length === 0);
      if (keep && [...select.options].some((o) => o.value === keep)) select.value = keep;
    });
  }
  refresh();
  select.addEventListener('change', () => {
    countryNote.hidden = true;
    try {
      settings.setPref('country', select.value);
    } catch {
      showCountryNote('country.error');
    }
    onCountryChange?.(select.value);
  });
  section.append(
    el('h2', '', t('country.title'), { id: countryId }),
    el('p', 'field__help', t('country.help'), { id: countryHelpId }),
    countryLabel,
    wrap,
    countryNote,
  );

  section.refresh = refresh;
  return section;
}
