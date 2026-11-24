import assert from 'node:assert/strict';
import test from 'node:test';
import { isIosSafari, isStandalone } from '../src/core/platform.js';

const webKit = 'AppleWebKit/605.1.15 (KHTML, like Gecko)';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)';
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

const agents = {
  iphoneSafari: `${iphone} ${webKit} Version/26.0 Mobile/15E148 Safari/604.1`,
  ipadSafari: `Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) ${webKit} Version/17.0 Mobile/15E148 Safari/604.1`,
  macSafari: `${mac} ${webKit} Version/18.0 Safari/605.1.15`,
};

test('iOS Safari is recognised on iPhone and iPad', () => {
  assert.equal(isIosSafari(agents.iphoneSafari, 5), true);
  assert.equal(isIosSafari(agents.ipadSafari, 5), true);
  // iPadOS asks for desktop sites with a Mac user agent.
  assert.equal(isIosSafari(agents.macSafari, 5), true);
});

test('desktop browsers get no install hint', () => {
  assert.equal(isIosSafari(agents.macSafari, 0), false);
  for (const ua of [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    `${mac} AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36`,
  ]) assert.equal(isIosSafari(ua, 0), false, ua);
});

test('Android and other iOS browsers or in-app views are not iOS Safari', () => {
  for (const ua of [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
    `${iphone} ${webKit} CriOS/130.0 Mobile/15E148 Safari/604.1`,
    `${iphone} ${webKit} FxiOS/130.0 Mobile/15E148 Safari/605.1.15`,
    `${iphone} ${webKit} Version/18.0 Mobile/15E148 Safari/604.1 EdgiOS/130.0`,
    `${iphone} ${webKit} GSA/340.0 Mobile/15E148 Safari/604.1`,
    `${iphone} ${webKit} Mobile/15E148 Instagram 350.0`,
  ]) assert.equal(isIosSafari(ua, 5), false, ua);
  assert.equal(isIosSafari(), false);
});

test('installed mode is detected from navigator.standalone or the display mode', () => {
  const media = (matches) => (query) => ({ matches: matches && query === '(display-mode: standalone)' });
  assert.equal(isStandalone(media(false), { standalone: true }), true);
  assert.equal(isStandalone(media(true), {}), true);
  assert.equal(isStandalone(media(false), { standalone: false }), false);
  assert.equal(isStandalone(undefined, undefined), false);
});
