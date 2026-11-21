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
  // The direct plan suspends access until the next billing cycle. Require an
  // explicit quota message until the response format is confirmed in AL-1.
  const message = typeof body === 'string' ? body : body?.message;
  return status === 429 && typeof message === 'string' &&
    /\b(?:quota\s+(?:(?:has been|is)\s+)?(?:exhausted|exceeded|reached)|(?:exhausted|exceeded|reached)\s+(?:(?:your|the|monthly)\s+)*quota)\b/i.test(message);
}

function retryDelay(headers) {
  const value = headers.get('Retry-After')?.trim();
  if (!value) return 0;
  const milliseconds = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Math.min(MAX_WAIT_MS, Math.max(0, milliseconds || 0));
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
  const timer = timeoutMs === undefined ? undefined :
    setTimeout(() => controller.abort('timeout'), timeoutMs);
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

export async function request(url, {
  headers, signal, timeoutMs = MAX_WAIT_MS, retryOn429 = false,
  fetchImpl = globalThis.fetch, sleep = delay,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    const result = await run(url, signal, Math.min(timeoutMs, MAX_WAIT_MS), async (active) => {
      try {
        if (globalThis.navigator?.onLine === false) return { type: 'offline' };
        const response = await fetchImpl(url, { headers, signal: active });
        if (response.ok) return { data: await response.json() };

        const { status } = response;
        if (status === 429) {
          const contentType = response.headers.get('Content-Type');
          const body = await (contentType?.startsWith('text/plain')
            ? response.text() : response.json()).catch(() => null);
          if (isQuotaExhausted(status, response.headers, body)) return { type: 'quota', status };
          return { type: 'rateLimited', status, wait: retryDelay(response.headers) };
        }
        return { type: failureType(status), status };
      } catch {
        return { type: globalThis.navigator?.onLine === false ? 'offline' : 'network' };
      }
    });

    if (!result.type) return result.data;
    if (result.type !== 'rateLimited' || !retryOn429 || attempt > 0) {
      throw new HttpError(result.type, url, result.status);
    }

    await run(url, signal, undefined, async (active) => {
      try {
        await sleep(result.wait, active);
      } catch {
        throw new HttpError('network', url);
      }
    });
  }
}
