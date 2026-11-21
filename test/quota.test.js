import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuota, DEFAULT_QUOTA_CONFIG } from '../src/api/quota.js';

function fixture(initialTime = '2026-11-15T00:00:00Z') {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let time = Date.parse(initialTime);
  return {
    storage,
    setTime: (value) => { time = Date.parse(value); },
    create: (config) => createQuota({ storage, now: () => time, config }),
  };
}

test('warns at 800 calls and blocks at 1000 by default', () => {
  assert.deepEqual(DEFAULT_QUOTA_CONFIG, { limit: 1000, warnRatio: 0.8, cycleStartDay: 1 });
  const quota = fixture().create();
  assert.deepEqual(quota.status(), {
    used: 0, limit: 1000, warn: false, blocked: false,
    cycleStart: Date.parse('2026-11-01T00:00:00Z'),
    nextReset: Date.parse('2026-12-01T00:00:00Z'),
  });
  const cases = [
    { used: 799, warn: false, blocked: false },
    { used: 800, warn: true, blocked: false },
    { used: 999, warn: true, blocked: false },
    { used: 1000, warn: true, blocked: true },
  ];
  let recorded = 0;
  for (const { used, warn, blocked } of cases) {
    while (recorded < used) {
      quota.record();
      recorded += 1;
    }
    assert.equal(quota.status().used, used);
    assert.equal(quota.status().warn, warn);
    assert.equal(quota.status().blocked, blocked);
    assert.equal(quota.canCall(), !blocked);
  }
});

test('persists usage and exhaustion under wtw.quota and clears both at midnight UTC', () => {
  const { storage, create, setTime } = fixture('2026-12-31T23:59:59.999Z');
  const quota = create();
  quota.record();
  quota.markExhausted();
  assert.equal(quota.canCall(), false);

  assert.deepEqual(JSON.parse(storage.getItem('wtw.quota')), {
    cycleStart: Date.parse('2026-12-01T00:00:00Z'), used: 1, exhausted: true,
  });
  assert.equal(create().status().used, 1);
  assert.equal(create().canCall(), false);

  setTime('2027-01-01T00:00:00Z');
  assert.equal(quota.canCall(), true);
  assert.equal(quota.status().used, 0);
  assert.equal(quota.status().nextReset, Date.parse('2027-02-01T00:00:00Z'));
});

test('uses configured thresholds and clamps the cycle day to the end of shorter months', () => {
  const { create, setTime } = fixture('2026-02-27T23:59:59.999Z');
  const quota = create({ limit: 2, warnRatio: 0.5, cycleStartDay: 31 });
  assert.equal(quota.status().cycleStart, Date.parse('2026-01-31T00:00:00Z'));
  assert.equal(quota.status().nextReset, Date.parse('2026-02-28T00:00:00Z'));
  quota.record();
  assert.equal(quota.status().warn, true);
  assert.equal(quota.canCall(), true);
  quota.record();
  assert.equal(quota.canCall(), false);

  setTime('2026-02-28T00:00:00Z');
  assert.equal(quota.status().used, 0);
  assert.equal(quota.status().nextReset, Date.parse('2026-03-31T00:00:00Z'));
});

test('reset clears the current cycle and invalid stored data is replaced', () => {
  const { storage, create } = fixture();
  storage.setItem('wtw.quota', '{');
  const quota = create();
  assert.equal(quota.status().used, 0);
  quota.record();
  quota.markExhausted();
  quota.reset();
  assert.equal(create().status().used, 0);
  assert.equal(create().canCall(), true);
});
