export const DEFAULT_QUOTA_CONFIG = Object.freeze({
  limit: 1000,
  warnRatio: 0.8,
  cycleStartDay: 1,
});

const storageKey = 'wtw.quota';

function monthBoundary(year, month, day) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day, lastDay));
}

export function createQuota({ storage, now = Date.now, config = {} }) {
  const { limit, warnRatio, cycleStartDay } = { ...DEFAULT_QUOTA_CONFIG, ...config };

  function save(state) {
    storage.setItem(storageKey, JSON.stringify(state));
  }

  function currentCycle() {
    const date = new Date(now());
    const year = date.getUTCFullYear();
    let month = date.getUTCMonth();
    if (date.getTime() < monthBoundary(year, month, cycleStartDay)) month -= 1;

    const cycleStart = monthBoundary(year, month, cycleStartDay);
    const nextReset = monthBoundary(year, month + 1, cycleStartDay);
    const empty = { cycleStart, used: 0, exhausted: false };
    const stored = storage.getItem(storageKey);
    let state;
    try {
      state = JSON.parse(stored);
    } catch {
      state = null;
    }

    if (state?.cycleStart !== cycleStart ||
        !Number.isSafeInteger(state.used) || state.used < 0 ||
        typeof state.exhausted !== 'boolean') {
      state = empty;
      if (stored !== null) save(state);
    }

    return { state, nextReset };
  }

  function status() {
    const { state: { used, exhausted, cycleStart }, nextReset } = currentCycle();
    return {
      used,
      limit,
      warn: used / limit >= warnRatio,
      blocked: exhausted || used >= limit,
      cycleStart,
      nextReset,
    };
  }

  return {
    canCall: () => !status().blocked,
    record() {
      const { state } = currentCycle();
      save({ ...state, used: state.used + 1 });
    },
    markExhausted() {
      const { state } = currentCycle();
      save({ ...state, exhausted: true });
    },
    status,
    reset() {
      const { state: { cycleStart } } = currentCycle();
      save({ cycleStart, used: 0, exhausted: false });
    },
  };
}
