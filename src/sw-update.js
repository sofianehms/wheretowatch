// "A new version is available": activates a waiting service worker only when the user asks.
import { renderBanners, updateBanner } from './render/banners.js';

/**
 * @param {ServiceWorkerContainer} container
 * @param {Promise<ServiceWorkerRegistration>} registering
 * @param {Element} slot Where the banner is announced.
 * @param {() => void} reload
 */
export async function watchForUpdate(container, registering, slot, reload) {
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
  const activate = () => {
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
