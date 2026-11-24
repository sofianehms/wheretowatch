// Platform detection from values passed in by the caller, so it stays testable outside a browser.

// Other iOS browsers and in-app views that otherwise look like Safari.
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Ddg\/|YaBrowser/;

/**
 * Safari on an iPhone, iPod or iPad. Recent iPads announce themselves as a Mac and are told apart by touch.
 * @param {string} ua `navigator.userAgent`.
 * @param {number} [maxTouchPoints] `navigator.maxTouchPoints`.
 */
export function isIosSafari(ua = '', maxTouchPoints = 0) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  return ios && /Version\/[\d.]+.*Safari\//.test(ua) && !NOT_SAFARI.test(ua);
}

/**
 * Whether the page runs as an installed app.
 * @param {(query: string) => {matches: boolean}} [matchMedia]
 * @param {{standalone?: boolean}} [navigatorLike] iOS exposes `navigator.standalone`.
 */
export function isStandalone(matchMedia, navigatorLike) {
  return navigatorLike?.standalone === true || Boolean(matchMedia?.('(display-mode: standalone)')?.matches);
}
