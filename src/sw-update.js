// "A new version is available": activates a waiting service worker only when the user asks.
import { renderBanners, updateBanner } from './render/banners.js';

const EDITS = 'wtw-unsaved-edits';

/**
 * Tells every tab whether one of them holds unsaved edits: such a tab keeps a shared lock, released with the edits
 * or when the tab closes. Without the Web Locks API only this tab is known.
 * @param {LockManager} [locks]
 */
export function createEditGuard(locks = globalThis.navigator?.locks) {
  let release = null;
  return {
    set(unsaved) {
      if (unsaved === Boolean(release)) return;
      if (!unsaved) {
        release();
        release = null;
        return;
      }
      const done = new Promise((resolve) => { release = resolve; });
      locks?.request(EDITS, { mode: 'shared' }, () => done).catch(() => {});
    },
    async anywhere() {
      if (release) return true;
      const state = await locks?.query().catch(() => null);
      return Boolean(state?.held.some(({ name }) => name === EDITS));
    },
  };
}

/**
 * @param {ServiceWorkerContainer} container
 * @param {Promise<ServiceWorkerRegistration>} registering
 * @param {Element} slot Where the banner is announced.
 * @param {() => void} reload
 * @param {() => Promise<boolean>} [unsavedEdits] True while a reload, in any tab, would lose edits.
 */
export async function watchForUpdate(container, registering, slot, reload, unsavedEdits = async () => false) {
  let reloaded = false;
  const reloadOnce = () => {
    if (!reloaded) reload();
    reloaded = true;
  };
  // The worker never claims pages, so a new controller means a waiting version was activated on request, here or in
  // another tab. Every page reloads then: old modules must not run against the new cache.
  container.addEventListener('controllerchange', reloadOnce);

  const registration = await registering;
  const banners = [updateBanner()];
  const activate = async () => {
    // Activation reloads every tab, so it waits until none of them has anything to lose.
    if (await unsavedEdits()) {
      renderBanners(slot, [updateBanner({ blocked: true })], { onAction: activate });
      // The pressed button was redrawn.
      slot.querySelector('button')?.focus();
      return;
    }
    const worker = registration.waiting;
    // Nothing waits any more: it was activated meanwhile.
    if (!worker) return reloadOnce();
    // A page without a controller (forced reload) gets no controllerchange.
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated' && !container.controller) reloadOnce();
    });
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
  // Without an active worker this is the first installation, not an update.
  const offer = () => {
    if (registration.waiting && registration.active) renderBanners(slot, banners, { onAction: activate });
  };
  const follow = (worker) => worker?.addEventListener('statechange', offer);
  registration.addEventListener('updatefound', () => follow(registration.installing));
  follow(registration.installing);
  offer();
}
