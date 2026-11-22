/**
 * search(query, { signal }) may return a title array or the source router's
 * { titles, error } result. States carry a status and, when applicable, the
 * trimmed query, titles or HttpError.
 */
export function createTypeahead({
  search, onState, delayMs = 275, minChars = 2, timers = globalThis,
}) {
  let timer;
  let active;
  let sequence = 0;
  let composing = false;

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
    onState({ status: 'loading', query });
    if (current !== sequence) return;

    let state;
    try {
      const result = await search(query, { signal: controller.signal });
      const { titles = result, error } = result;
      if (error) throw error;
      state = { status: titles.length ? 'results' : 'empty', query, titles };
    } catch (error) {
      state = { status: 'error', query, error };
    } finally {
      if (active === controller) active = undefined;
    }
    if (current === sequence) onState(state);
  }

  function reset() {
    const current = invalidate();
    abortActive();
    if (current === sequence) onState({ status: 'idle' });
  }

  function update(value, immediate = false) {
    if (composing) return;
    const query = value.trim();
    if ([...query].length < minChars) {
      reset();
      return;
    }
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
      composing = true;
      reset();
    },
    compositionEnd(value) {
      composing = false;
      update(value);
    },
    submit: (value) => update(value, true),
    cancel: reset,
  };
}
