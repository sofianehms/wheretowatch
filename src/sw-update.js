// "A new version is available": activates a waiting service worker only when the user asks.
import { renderBanners, updateBanner } from './render/banners.js';

const EDITS = 'wtw-unsaved-edits';

/**
 * Whether a tab holds unsaved edits: such a tab keeps a shared lock until the edits go or the tab closes. Without
 * Web Locks only this tab is known, and it still never reloads over its own edits.
 * @param {LockManager} [locks]
 */
export function createEditGuard(locks = globalThis.navigator?.locks) {
  let release = null;
  const listeners = new Set();
  return {
    set(unsaved) {
      if (unsaved === Boolean(release)) return;
      if (unsaved) {
        const done = new Promise((resolve) => { release = resolve; });
        locks?.request(EDITS, { mode: 'shared' }, () => done).catch(() => {});
      } else {
        release();
        release = null;
      }
      for (const listener of listeners) listener(unsaved);
    },
    here: () => Boolean(release),
    onChange(listener) { listeners.add(listener); },
    async anywhere() {
      if (release) return true;
      const state = await locks?.query().catch(() => null);
      return Boolean(state?.held.some(({ name }) => name === EDITS));
    },
  };
}

const NO_EDITS = { here: () => false, onChange() {}, anywhere: async () => false };

/**
 * idle → offered → blocked (edits in a tab) ⇄ offered → activating → reloaded. A new controller reloads once,
 * except over this tab's edits: deferred until they are saved or dropped.
 * @param {ServiceWorkerContainer} container
 * @param {Promise<ServiceWorkerRegistration>} registering
 * @param {Element} slot Where the banner is announced.
 * @param {() => void} reload
 * @param {Pick<ReturnType<typeof createEditGuard>, 'here' | 'onChange' | 'anywhere'>} [edits]
 */
export async function watchForUpdate(container, registering, slot, reload, edits = NO_EDITS) {
  let state = 'idle';
  const show = (blocked) => {
    renderBanners(slot, [updateBanner({ blocked })], { onAction: activate });
  };
  // The worker never claims pages: a new controller is a version activated on request, here or in another tab.
  const takeOver = () => {
    if (state === 'reloaded') return;
    if (edits.here()) {
      if (state !== 'deferred') show(true);
      state = 'deferred';
      return;
    }
    state = 'reloaded';
    reload();
  };
  edits.onChange((unsaved) => {
    if (!unsaved && state === 'deferred') takeOver();
  });
  container.addEventListener('controllerchange', takeOver);

  const registration = await registering;
  async function activate() {
    if (state === 'activating' || state === 'reloaded') return;
    // Activation reloads every tab: wait until none has anything to lose.
    if (await edits.anywhere()) {
      if (state !== 'deferred') state = 'blocked';
      show(true);
      // The pressed button was redrawn.
      slot.querySelector('button')?.focus();
      return;
    }
    const worker = registration.waiting;
    // Nothing waits any more: it was activated meanwhile.
    if (!worker) return takeOver();
    state = 'activating';
    // A page without a controller (forced reload) gets no controllerchange.
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' && !container.controller) takeOver();
    });
    worker.postMessage({ type: 'SKIP_WAITING' });
  }
  // Without an active worker this is the first installation, not an update.
  const offer = () => {
    if (state !== 'idle' || !registration.waiting || !registration.active) return;
    state = 'offered';
    show(false);
  };
  const follow = (worker) => worker?.addEventListener('statechange', offer);
  registration.addEventListener('updatefound', () => follow(registration.installing));
  follow(registration.installing);
  offer();
}
