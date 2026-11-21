import common from './en/common.js';
import search from './en/search.js';
import title from './en/title.js';
import verdict from './en/verdict.js';
import settings from './en/settings.js';
import banners from './en/banners.js';
import about from './en/about.js';
import install from './en/install.js';

const defaultLocale = 'en';
const locales = {
  en: { common, search, title, verdict, settings, banners, about, install },
};
const dateLocales = { en: 'en-GB' };

let locale = defaultLocale;

export function setLocale(requestedLocale) {
  locale = Object.hasOwn(locales, requestedLocale) ? requestedLocale : defaultLocale;
}

export function getLocale() {
  return locale;
}

export function t(key, params = {}) {
  const separator = key.indexOf('.');
  if (separator === -1) return key;

  const area = key.slice(0, separator);
  const name = key.slice(separator + 1);
  const dictionary = locales[locale];
  if (!Object.hasOwn(dictionary, area) || !Object.hasOwn(dictionary[area], name)) return key;

  return dictionary[area][name].replace(/\{(\w+)\}/g, (placeholder, param) =>
    Object.hasOwn(params, param) ? String(params[param]) : placeholder
  );
}

export function formatDate(date) {
  return new Intl.DateTimeFormat(dateLocales[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function displayName(code, type) {
  try {
    return new Intl.DisplayNames(locale, { type, fallback: 'none' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryName(code) {
  return displayName(code, 'region');
}

export function languageName(code) {
  return displayName(code, 'language');
}

export function applyStaticStrings(root) {
  const selector = '[data-i18n]';
  const apply = (element) => {
    const value = t(element.dataset.i18n);
    const attribute = element.dataset.i18nAttr;
    if (attribute) {
      element.setAttribute(attribute, value);
    } else {
      element.textContent = value;
    }
  };

  if (root.matches?.(selector)) apply(root);
  root.querySelectorAll(selector).forEach(apply);
}
