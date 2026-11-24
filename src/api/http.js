const MAX_WAIT_MS = 10_000;

const messages = {
  auth: 'Access denied. Check your API key.',
  notFound: 'Resource not found. Check the requested resource.',
  rateLimited: 'Too many requests. Try again later.',
  quota: 'Request quota exhausted. Try again after it resets.',
  network: 'Could not complete the request. Try again.',
  offline: 'You are offline. Check your connection and try again.',
  timeout: 'The request timed out. Try again.',
  aborted: 'The request was cancelled.',
  server: 'The service returned an error. Try again later.',
};

export class HttpError extends Error {
  constructor(type, url, status) {
    let endpoint = '';
    try {
      const { host, pathname, protocol } = new URL(url, globalThis.location?.href);
      if (protocol === 'https:' || protocol === 'http:') endpoint = ` (${host}${pathname})`;
    } catch {
      // A malformed URL may contain sensitive input.
    }
    super(messages[type] + endpoint);
    this.name = 'HttpError';
    this.type = type;
    this.status = status;
  }
}

export function isQuotaExhausted(status, _headers, body) {
  // Match complete quota messages pending live response validation in AL-1.
  const message = typeof body === 'string' ? body : body?.message;
  return status === 429 && typeof message === 'string' &&
    /^(?:Your monthly quota has been exceeded|Request quota exhausted for this billing cycle)\.?$/i
      .test(message.trim());
}

export function canUseStale(error) {
  return ['network', 'server', 'timeout'].includes(error?.type);
}

function retryDelay(headers) {
  const value = headers.get('Retry-After')?.trim();
  if (!value) return 0;
  const milliseconds = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Math.max(0, milliseconds || 0);
}

function delay(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, ms);
    function stop() {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', stop, { once: true });
  });
}

async function run(url, signal, timeoutMs, operation) {
  const controller = new AbortController();
  const cancel = () => controller.abort('aborted');
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = timeoutMs === null ? null : setTimeout(() => controller.abort('timeout'), timeoutMs);
  const active = controller.signal;
  let stop;
  try {
    if (active.aborted) throw new HttpError(active.reason, url);
    const cancellation = new Promise((_, reject) => {
      stop = () => reject(new HttpError(active.reason, url));
      active.addEventListener('abort', stop, { once: true });
    });
    return await Promise.race([cancellation, operation(active)]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (stop) active.removeEventListener('abort', stop);
  }
}

function failureType(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notFound';
  return 'server';
}

/**
 * Returns JSON or throws an HttpError whose type identifies the failure.
 * Each attempt has its own timeout for fetching and parsing, capped at 10 seconds.
 * The retry wait is capped separately. Set retryOn429 to 'within-budget'
 * to surface the rate-limit error when Retry-After exceeds that cap.
 * An injected sleep(ms, signal) waits in milliseconds and should stop on abort.
 */
export async function request(url, {
  headers, signal, timeoutMs = MAX_WAIT_MS, retryOn429 = false,
  fetchImpl = globalThis.fetch, sleep = delay, onResponse, redirect,
} = {}) {
  const attempt = () => run(url, signal, Math.min(timeoutMs, MAX_WAIT_MS), async (active) => {
    try {
      if (globalThis.navigator?.onLine === false) return { type: 'offline' };
      const response = await fetchImpl(url, { headers, signal: active, ...(redirect && { redirect }) });
      onResponse?.(response.headers);
      if (response.ok) return { data: await response.json() };

      const { status } = response;
      if (status === 429) {
        const contentType = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
        const body = await (contentType === 'text/plain'
          ? response.text() : response.json()).catch(() => null);
        if (isQuotaExhausted(status, response.headers, body)) return { type: 'quota', status };
        return { type: 'rateLimited', status, wait: retryDelay(response.headers) };
      }
      return { type: failureType(status), status };
    } catch {
      return { type: globalThis.navigator?.onLine === false ? 'offline' : 'network' };
    }
  });

  let result = await attempt();
  if (retryOn429 && result.type === 'rateLimited' &&
      (retryOn429 !== 'within-budget' || result.wait <= MAX_WAIT_MS)) {
    await run(url, signal, null, async (active) => {
      try {
        await sleep(Math.min(result.wait, MAX_WAIT_MS), active);
      } catch {
        throw new HttpError('network', url);
      }
    });
    result = await attempt();
  }
  if (result.type) throw new HttpError(result.type, url, result.status);
  return result.data;
}
