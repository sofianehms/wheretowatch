import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'acorn';

import { createEditGuard, watchForUpdate } from '../src/sw-update.js';
import { sw } from './shell-fixture.js';

function* nodes(node, ancestors = []) {
  yield [node, ancestors];
  for (const value of Object.values(node)) {
    for (const child of [value].flat()) {
      if (typeof child?.type === 'string') yield* nodes(child, [...ancestors, node]);
    }
  }
}

const isMessageListener = (node) => node.type === 'CallExpression'
  && node.callee.property?.name === 'addEventListener' && node.arguments[0]?.value === 'message';

const isRequestGuard = (node) => node.type === 'IfStatement' && node.test.operator === '==='
  && node.test.right.value === 'SKIP_WAITING' && node.test.left.type === 'ChainExpression'
  && node.test.left.expression.property.name === 'type';

// Every mention of skipWaiting, whatever its form, must sit behind the request guard of the message handler.
function checkSkipWaiting(source) {
  const mentions = [...nodes(parse(source, { ecmaVersion: 'latest' }))].filter(([node]) => (
    (node.type === 'Identifier' && node.name === 'skipWaiting') || (node.type === 'Literal' && node.value === 'skipWaiting')));
  assert.equal(mentions.length, 1, 'skipWaiting must appear exactly once');
  const [, ancestors] = mentions[0];
  const listener = ancestors.findIndex(isMessageListener);
  assert.ok(listener !== -1, 'skipWaiting is outside the message handler');
  assert.ok(ancestors.slice(listener).some(isRequestGuard), 'skipWaiting does not wait for SKIP_WAITING');
}

test('sw.js calls skipWaiting only in the message handler, on request', () => {
  checkSkipWaiting(sw);
});

test('the analysis rejects skipWaiting anywhere else', () => {
  const handler = "self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });";
  checkSkipWaiting(handler);
  for (const source of [
    `${handler} self.addEventListener('install', () => self.skipWaiting());`,
    "self.addEventListener('install', () => self.skipWaiting());",
    "self.addEventListener('message', () => self.skipWaiting());",
    `${handler} self['skipWaiting']();`,
    'self.skipWaiting();',
  ]) assert.throws(() => checkSkipWaiting(source), assert.AssertionError, source);
});

test('only the SKIP_WAITING message activates the worker', () => {
  const listeners = {};
  let skipped = 0;
  const self = { addEventListener: (type, listener) => { listeners[type] = listener; }, skipWaiting: () => { skipped += 1; } };
  new Function('self', sw)(self);
  for (const data of [null, undefined, 'SKIP_WAITING', {}, { type: 'skip_waiting' }]) listeners.message({ data });
  assert.equal(skipped, 0);
  listeners.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(skipped, 1);
});

class FakeWorker extends EventTarget {
  state = 'installing';
  messages = [];
  postMessage(message) { this.messages.push(message); }
  become(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

// Just enough DOM to draw one banner and press its button.
class FakeNode extends EventTarget {
  children = [];
  setAttribute() {}
  append(...added) { this.children.push(...added); }
  replaceChildren(...added) { this.children = added; }
  get lastChild() { return this.children.at(-1); }
  find(test) {
    if (test(this)) return this;
    for (const child of this.children) {
      const found = child instanceof FakeNode && child.find(test);
      if (found) return found;
    }
    return null;
  }
}

async function setup(t, { active = true, waiting = null, installing = null, controller = {}, unsavedEdits } = {}) {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => new FakeNode(), createElementNS: () => new FakeNode() };
  t.after(() => { globalThis.document = previous; });
  const container = Object.assign(new EventTarget(), { controller });
  const registration = Object.assign(new EventTarget(), { active: active ? new FakeWorker() : null, waiting, installing });
  const slot = Object.assign(new FakeNode(), { querySelector: () => null });
  const page = { container, registration, slot, reloads: 0 };
  await watchForUpdate(container, Promise.resolve(registration), slot, () => { page.reloads += 1; }, unsavedEdits);
  page.button = () => slot.find((node) => node.type === 'button' || /\bbtn\b/.test(node.className));
  page.press = () => {
    page.button().dispatchEvent(new Event('click'));
    // The edits are asked for before anything happens.
    return new Promise((resolve) => setImmediate(resolve));
  };
  page.takeOver = () => container.dispatchEvent(new Event('controllerchange'));
  return page;
}

function install(page) {
  const worker = new FakeWorker();
  page.registration.installing = worker;
  page.registration.dispatchEvent(new Event('updatefound'));
  page.registration.installing = null;
  page.registration.waiting = worker;
  worker.become('installed');
  return worker;
}

test('a version already waiting is offered, and nothing happens until asked', async (t) => {
  const worker = new FakeWorker();
  const page = await setup(t, { waiting: worker });
  assert.equal(page.slot.children.length, 1);
  assert.equal(page.button().textContent, 'Reload');
  assert.deepEqual(worker.messages, []);
  assert.equal(page.reloads, 0);
});

test('Reload sends SKIP_WAITING, then reloads once when the new version takes control', async (t) => {
  const page = await setup(t);
  const worker = install(page);
  await page.press();
  assert.deepEqual(worker.messages, [{ type: 'SKIP_WAITING' }]);
  assert.equal(page.reloads, 0);
  worker.become('activating');
  page.takeOver();
  page.takeOver();
  worker.become('activated');
  assert.equal(page.reloads, 1);
});

test('a version already installing when the page starts is offered once installed', async (t) => {
  const worker = new FakeWorker();
  const page = await setup(t, { installing: worker });
  assert.equal(page.slot.children.length, 0);
  page.registration.waiting = worker;
  worker.become('installed');
  assert.equal(page.slot.children.length, 1);
});

test('the first installation shows no banner and never reloads', async (t) => {
  const page = await setup(t, { active: false, controller: null });
  install(page);
  assert.equal(page.slot.children.length, 0);
  assert.equal(page.reloads, 0);
});

test('a page without a controller reloads once the requested version is active', async (t) => {
  const page = await setup(t, { controller: null });
  const worker = install(page);
  await page.press();
  worker.become('activated');
  assert.equal(page.reloads, 1);
});

test('a version activated from another tab reloads this page, so versions never mix', async (t) => {
  const page = await setup(t);
  install(page);
  page.takeOver();
  assert.equal(page.reloads, 1);
});

test('Reload still works when nothing waits any more', async (t) => {
  const page = await setup(t, { controller: null });
  install(page);
  page.registration.waiting = null;
  await page.press();
  assert.equal(page.reloads, 1);
});

test('nothing is activated while a tab has unsaved edits, and the banner says why', async (t) => {
  let unsaved = true;
  const page = await setup(t, { unsavedEdits: async () => unsaved });
  const worker = install(page);
  await page.press();
  await page.press();
  assert.deepEqual(worker.messages, []);
  assert.equal(page.reloads, 0);
  assert.ok(page.slot.find((node) => node.children.some((child) => /unsaved changes/.test(child))), 'no explanation');
  unsaved = false;
  await page.press();
  assert.deepEqual(worker.messages, [{ type: 'SKIP_WAITING' }]);
});

test('unsaved edits also hold back the reload of a version already activated', async (t) => {
  const page = await setup(t, { controller: null, unsavedEdits: async () => true });
  install(page);
  page.registration.waiting = null;
  await page.press();
  assert.equal(page.reloads, 0);
});

// Shared locks, as much of them as the guard uses; one instance stands for all the tabs.
function fakeLocks() {
  const held = new Set();
  return {
    async request(name, options, callback) {
      const lock = { name };
      held.add(lock);
      await callback(lock);
      held.delete(lock);
    },
    query: async () => ({ held: [...held] }),
  };
}

const released = () => new Promise((resolve) => setImmediate(resolve));

test('unsaved edits are known to every tab until each one has none left', async () => {
  const locks = fakeLocks();
  const [first, second, asking] = [createEditGuard(locks), createEditGuard(locks), createEditGuard(locks)];
  assert.equal(await asking.anywhere(), false);
  first.set(true);
  first.set(true);
  second.set(true);
  assert.equal(await asking.anywhere(), true);
  first.set(false);
  first.set(false);
  await released();
  assert.equal(await asking.anywhere(), true);
  second.set(false);
  await released();
  assert.equal(await asking.anywhere(), false);
  assert.equal((await locks.query()).held.length, 0);
});

test('without the Web Locks API, or when it refuses, a tab still knows its own edits', async () => {
  for (const locks of [null, { request: async () => { throw new Error('refused'); }, query: async () => { throw new Error('refused'); } }]) {
    const guard = createEditGuard(locks);
    assert.equal(await guard.anywhere(), false);
    guard.set(true);
    assert.equal(await guard.anywhere(), true);
    guard.set(false);
    assert.equal(await guard.anywhere(), false);
  }
});
