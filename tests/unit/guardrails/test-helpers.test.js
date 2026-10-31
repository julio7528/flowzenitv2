import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeferred, createFakeClock, createSideEffectSpy } from './test-helpers.js';

test('side-effect spy counts handler calls without retaining supplied arguments', () => {
  const spy = createSideEffectSpy();
  const handler = spy.handler('synthetic.write@1');

  assert.equal(spy.total, 0);
  handler({ sentinel: 'SYNTHETIC_SECRET_SENTINEL_ALPHA_01' });
  handler();

  assert.equal(spy.total, 2);
  assert.equal(spy.count('synthetic.write@1'), 2);
  assert.deepEqual(spy.snapshot(), { total: 2, byOperation: { 'synthetic.write@1': 2 } });
  assert.equal(JSON.stringify(spy.snapshot()).includes('SYNTHETIC_SECRET_SENTINEL_ALPHA_01'), false);
});

test('fake clock advances only by explicit finite non-negative durations', () => {
  const clock = createFakeClock(100);
  assert.equal(clock.now(), 100);
  assert.equal(clock.advance(25), 125);
  assert.equal(clock.set(200), 200);
  assert.throws(() => clock.advance(-1), TypeError);
  assert.throws(() => createFakeClock(Number.NaN), TypeError);
});

test('deferred helper exposes only the test-controlled promise settlement', async () => {
  const deferred = createDeferred();
  const observed = deferred.promise.then(value => value);
  deferred.resolve('synthetic-result');
  assert.equal(await observed, 'synthetic-result');
});
