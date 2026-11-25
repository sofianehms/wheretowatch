import { HttpError } from '../api/http.js';

/** @typedef {import('../api/sources.js').Title} Title */

/**
 * @typedef {Title[] | {titles: Title[], error?: unknown}} SearchResult
 * @typedef {(query: string, options: {signal: AbortSignal}) => SearchResult | Promise<SearchResult>} Search
 * @typedef {{status: 'idle'} |
 *   {status: 'loading', query: string} |
 *   {status: 'results' | 'empty', query: string, titles: Title[]} |
 *   {status: 'error', query: string, error: HttpError}} TypeaheadState
 */

/**
 * @param {object} options
 * @param {Search} options.search Receives the trimmed query and its cancellation signal.
 * @param {(state: TypeaheadState) => void} options.onState Unexpected search failures use the network error type.
 * @param {number} [options.delayMs=275]
 * @param {number} [options.minChars=2]
 * @param {Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>} [options.timers]
 */
export function createTypeahead({
  search, onState, delayMs = 275, minChars = 2, timers = globalThis,
}) {
  let timer;
  let active;
  let settledQuery;
  let searchFailed = false;
  let sequence = 0;
  let composition;

  function invalidate() {
    sequence += 1;
    if (timer !== undefined) timers.clearTimeout(timer);
    timer = undefined;
    return sequence;
  }

  function abortActive() {
    const previous = active;
    active = undefined;
    previous?.abort();
  }

  async function run(query, current) {
    if (current !== sequence) return;
    timer = undefined;
    abortActive();
    if (current !== sequence) return;
    const controller = new AbortController();
    active = controller;
    settledQuery = query;
    searchFailed = false;
    onState({ status: 'loading', query });
    if (current !== sequence) return;

    /** @type {TypeaheadState} */
    let state;
    try {
      const result = await search(query, { signal: controller.signal });
      if (!Array.isArray(result) && result.error != null) throw result.error;
      const titles = Array.isArray(result) ? result : result.titles;
      state = { status: titles.length ? 'results' : 'empty', query, titles };
    } catch (error) {
      state = { status: 'error', query, error: error instanceof HttpError ? error : new HttpError('network') };
    } finally {
      if (active === controller) active = undefined;
    }
    if (current !== sequence) return;
    searchFailed = state.status === 'error';
    onState(state);
  }

  function reset() {
    const current = invalidate();
    settledQuery = undefined;
    abortActive();
    if (current === sequence) onState({ status: 'idle' });
  }

  function update(value, immediate = false) {
    if (composition) return;
    const query = value.trim();
    if ([...query].length < minChars) {
      reset();
      return;
    }
    if (query === settledQuery && !(immediate && searchFailed)) return;
    settledQuery = undefined;
    const current = invalidate();
    if (immediate) {
      void run(query, current);
    } else {
      timer = timers.setTimeout(() => run(query, current), delayMs);
    }
  }

  return {
    input: (value) => update(value),
    compositionStart() {
      composition = 'active';
      reset();
    },
    compositionEnd(value) {
      const finished = composition;
      composition = undefined;
      if (finished === 'active') update(value);
    },
    submit: (value) => update(value, true),
    cancel() {
      if (composition) composition = 'cancelled';
      reset();
    },
    // The network is gone: nothing queued, running or settled survives. The field is disabled, so a
    // composition may never report its end: forget it rather than ignore every later keystroke.
    stop() {
      composition = undefined;
      reset();
    },
  };
}
