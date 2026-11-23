export const DEFAULT_QUOTA_CONFIG = Object.freeze({
  limit: 1000,
  warnRatio: 0.8,
  cycleStartDay: 1,
});

const storageKey = 'wtw.quota';

function quotaNumber(headers, name) {
  const value = headers.get(name);
  return value && /^\d+$/.test(value) ? Number(value) : NaN;
}

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

    const serverCycle = Number.isFinite(state?.serverReset) &&
      Number.isSafeInteger(state.serverLimit) && state.serverLimit > 0;
    if ((serverCycle ? state.serverReset <= date.getTime() : state?.cycleStart !== cycleStart) ||
        (!serverCycle && (state?.serverReset !== undefined || state?.serverLimit !== undefined)) ||
        !Number.isSafeInteger(state.used) || state.used < 0 ||
        typeof state.exhausted !== 'boolean') {
      state = empty;
      if (stored !== null) save(state);
    }

    return { state, nextReset: state.serverReset ?? nextReset };
  }

  function status() {
    const { state: { used, exhausted, cycleStart, serverLimit }, nextReset } = currentCycle();
    const activeLimit = serverLimit ?? limit;
    return {
      used,
      limit: activeLimit,
      warn: used / activeLimit >= warnRatio,
      blocked: exhausted || used >= activeLimit,
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
    sync(headers) {
      const serverLimit = quotaNumber(headers, 'x-quota-granted');
      const used = quotaNumber(headers, 'x-quota-used');
      const serverReset = Date.parse(headers.get('x-quota-reset'));
      if (!Number.isSafeInteger(serverLimit) || serverLimit < 1 || !Number.isSafeInteger(used) ||
          !Number.isFinite(serverReset) || serverReset <= now()) return;
      const { state } = currentCycle();
      if (state.serverReset > serverReset) return;
      save({
        ...state,
        // Keep charges already recorded for overlapping requests in the current cycle.
        used: state.serverReset && state.serverReset !== serverReset ? used : Math.max(used, state.used),
        serverLimit,
        serverReset,
      });
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
