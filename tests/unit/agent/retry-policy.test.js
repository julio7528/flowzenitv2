import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryEligible } from '../../../server/agent/runtime/retry.js';

const providerInput = (overrides = {}) => ({
  source: 'provider',
  category: 'transient',
  retryCount: 0,
  remainingMs: 45_000,
  verifiedIdempotentRead: false,
  ...overrides,
});

test('allows one transient provider retry when the fixed delay fits the deadline', () => {
  assert.equal(isRetryEligible(providerInput()), true);
  assert.equal(isRetryEligible(providerInput({ remainingMs: 250 })), true);
});

test('denies provider retries for permanent, configuration, timeout, and cancellation errors', () => {
  for (const category of ['permanent', 'configuration', 'timeout', 'cancelled']) {
    assert.equal(isRetryEligible(providerInput({ category })), false, category);
  }
});

test('allows tool dependency retry only for a verified idempotent read', () => {
  assert.equal(isRetryEligible(providerInput({
    source: 'tool',
    category: 'dependency_failure',
    verifiedIdempotentRead: true,
  })), true);

  assert.equal(isRetryEligible(providerInput({
    source: 'tool',
    category: 'dependency_failure',
    verifiedIdempotentRead: false,
  })), false);
});

test('denies a second retry and any retry with less than the fixed delay remaining', () => {
  assert.equal(isRetryEligible(providerInput({ retryCount: 1 })), false);
  assert.equal(isRetryEligible(providerInput({ remainingMs: 249 })), false);
});

test('does not treat other tool errors as retryable', () => {
  assert.equal(isRetryEligible(providerInput({
    source: 'tool',
    category: 'transient',
    verifiedIdempotentRead: true,
  })), false);
});
