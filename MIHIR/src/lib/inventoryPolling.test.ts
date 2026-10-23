import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startInventoryPolling, INVENTORY_REFRESH_MS } from './inventoryPolling';
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('inventory refreshes every 30 seconds, pauses, and supports manual refresh while paused', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let reads = 0; let result = 0;
  const poll = startInventoryPolling({ read: async () => ++reads, onResult: value => { result = value; }, onError: () => assert.fail('Unexpected error'), onBusy: () => {}, onSchedule: () => {} });
  await settle(); assert.equal(reads, 1); assert.equal(INVENTORY_REFRESH_MS, 30000);
  t.mock.timers.tick(29999); await settle(); assert.equal(reads, 1);
  t.mock.timers.tick(1); await settle(); assert.equal(reads, 2);
  poll.pause(); t.mock.timers.tick(90000); await settle(); assert.equal(reads, 2);
  await poll.refresh(); assert.equal(result, 3);
  poll.resume(); await settle(); assert.equal(reads, 4);
  poll.stop(); t.mock.timers.tick(90000); await settle(); assert.equal(reads, 4);
});
test('slow polls never overlap and stopped requests cannot replace the current snapshot', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0; let release!: (value: string) => void; let signal!: AbortSignal; const results: string[] = [];
  const poll = startInventoryPolling({ read: async value => { reads++; signal = value; return new Promise<string>(resolve => { release = resolve; }); }, onResult: value => results.push(value), onError: () => {}, onBusy: () => {}, onSchedule: () => {} });
  void poll.refresh(); void poll.refresh(); t.mock.timers.tick(90000); assert.equal(reads, 1);
  poll.pause(); release('old'); await settle(); assert.deepEqual(results, ['old']);
  poll.resume(); assert.equal(reads, 2); poll.stop(); assert.equal(signal.aborted, true);
  release('late'); await settle(); assert.deepEqual(results, ['old']);
});
test('refresh errors retain previous results and schedule a subsequent retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let reads = 0; const results: number[] = []; let errors = 0;
  const poll = startInventoryPolling({ read: async () => { if (++reads === 2) throw new Error('offline'); return reads; }, onResult: value => results.push(value), onError: () => { errors++; }, onBusy: () => {}, onSchedule: () => {} });
  await settle(); t.mock.timers.tick(30000); await settle(); assert.equal(errors, 1); assert.deepEqual(results, [1]);
  t.mock.timers.tick(30000); await settle(); assert.deepEqual(results, [1, 3]); poll.stop();
});
