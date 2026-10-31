import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createConfirmationGrantIssuer,
  createConfirmationGrantValidator,
  createConfirmationRequestSummary,
  isActionBoundConfirmationGrant,
} from '../../../server/agent/guardrails/confirmation.js';
import { SYNTHETIC_CONFIRMATION_MATRIX } from '../../fixtures/security/confirmations.js';

function request(displayFields = { item: 'Synthetic task', change: 'Synthetic update' }) {
  return createConfirmationRequestSummary({
    operationName: 'synthetic.write',
    operationVersion: '1',
    target: { id: 'synthetic-42', kind: 'task' },
    payload: { status: 'Done', note: 'synthetic' },
    preconditions: { revision: 3, status: 'Backlog' },
    policyVersion: 'synthetic-policy@1',
    displayFields,
  });
}

test('confirmation summary is canonical, action-bound, and explicitly unapproved/unexecuted', () => {
  const summary = request();
  assert.equal(summary.state, 'confirmation_required');
  assert.equal(summary.operation.name, 'synthetic.write');
  assert.equal(summary.target.id, 'synthetic-42');
  assert.match(summary.targetFingerprint, /^[a-f0-9]{64}$/);
  assert.match(summary.payloadHash, /^[a-f0-9]{64}$/);
  assert.match(summary.preconditionFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(summary.notice, 'This action has not been approved or executed.');
  assert.equal(Object.hasOwn(summary, 'approved'), false);
  assert.equal(Object.hasOwn(summary, 'handlerResult'), false);
});

test('display-field key order does not change the canonical summary identity', () => {
  const first = request({ item: 'Synthetic task', change: 'Synthetic update' });
  const second = request({ change: 'Synthetic update', item: 'Synthetic task' });
  assert.equal(first.payloadHash, second.payloadHash);
  assert.equal(first.targetFingerprint, second.targetFingerprint);
  assert.deepEqual(first.displayFields, second.displayFields);
});

test('malformed identity and non-JSON summary values reject before any action', () => {
  assert.throws(() => createConfirmationRequestSummary({ operationName: 'private action', operationVersion: '1' }), TypeError);
  assert.throws(() => createConfirmationRequestSummary({
    operationName: 'synthetic.write', operationVersion: '1', target: { id: 'x' }, payload: { value: 1n },
    preconditions: {}, policyVersion: 'synthetic-policy@1',
  }), TypeError);
});

test('confirmation grant binds exact action fields and obtains idempotency key only from server port', async () => {
  const portRequests = [];
  const issuer = createConfirmationGrantIssuer({
    idempotencyKeyPort: {
      async createKey(requestValue) {
        portRequests.push(requestValue);
        return 'synthetic-server-idempotency-key';
      },
    },
  });
  const issuedAt = 1_800_000_000_000;
  const grant = await issuer.issue({
    conversationRef: 'synthetic-conversation-7',
    operationName: 'synthetic.write',
    operationVersion: '1',
    target: { id: 'synthetic-42', kind: 'task' },
    payload: { status: 'Done', note: 'synthetic' },
    preconditions: { revision: 3, status: 'Backlog' },
    issuedAt,
    expiresAt: issuedAt + 60_000,
    policyVersion: 'synthetic-policy@1',
  });

  assert.equal(isActionBoundConfirmationGrant(grant), true);
  assert.equal(grant.conversationRef, 'synthetic-conversation-7');
  assert.equal(grant.operationName, 'synthetic.write');
  assert.equal(grant.operationVersion, '1');
  assert.equal(grant.canonicalTarget, '{"id":"synthetic-42","kind":"task"}');
  assert.match(grant.payloadHash, /^[a-f0-9]{64}$/);
  assert.match(grant.preconditionFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(grant.issuedAt, issuedAt);
  assert.equal(grant.expiresAt, issuedAt + 60_000);
  assert.ok(grant.nonce);
  assert.equal(grant.policyVersion, 'synthetic-policy@1');
  assert.equal(grant.idempotencyKey, 'synthetic-server-idempotency-key');
  assert.equal(Object.keys(portRequests[0]).join(','), 'actionHash');
  assert.match(portRequests[0].actionHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(grant), true);
});

test('grant issuer rejects client-supplied idempotency keys and invalid expiry', async () => {
  let keyRequests = 0;
  const issuer = createConfirmationGrantIssuer({
    idempotencyKeyPort: { async createKey() { keyRequests += 1; return 'synthetic-server-key'; } },
  });
  const action = {
    conversationRef: 'synthetic-conversation', operationName: 'synthetic.write', operationVersion: '1',
    target: { id: 'synthetic' }, payload: { status: 'Done' }, preconditions: { revision: 1 },
    issuedAt: 100, expiresAt: 200, policyVersion: 'synthetic-policy@1',
  };
  await assert.rejects(() => issuer.issue({ ...action, idempotencyKey: 'client-key' }), TypeError);
  await assert.rejects(() => issuer.issue({ ...action, expiresAt: 100 }), TypeError);
  assert.equal(keyRequests, 0);
  assert.throws(() => createConfirmationGrantIssuer({}), TypeError);
});

const GRANT_ACTION = Object.freeze({
  conversationRef: 'synthetic-conversation-7',
  operationName: 'synthetic.write',
  operationVersion: '1',
  target: Object.freeze({ id: 'synthetic-42', kind: 'task' }),
  payload: Object.freeze({ status: 'Done', note: 'synthetic' }),
});

async function issueGrant(action = GRANT_ACTION) {
  const issuer = createConfirmationGrantIssuer({
    idempotencyKeyPort: { async createKey() { return 'synthetic-server-key'; } },
  });
  return issuer.issue({
    ...action,
    preconditions: { revision: 3, status: 'Backlog' },
    issuedAt: 100,
    expiresAt: 200,
    policyVersion: SYNTHETIC_CONFIRMATION_MATRIX.version,
  });
}

function makeValidator({ now = 150, matrix = SYNTHETIC_CONFIRMATION_MATRIX, accessAllowed = true, snapshot = { revision: 3, status: 'Backlog' } } = {}) {
  return createConfirmationGrantValidator({
    accessGate: { async allowsAction() { return accessAllowed; } },
    matrixProvider: () => matrix,
    actionValidator: async action => ({ valid: true, ...action, capability: 'synthetic.write' }),
    currentPreconditionsProvider: async () => ({ available: true, snapshot }),
    clock: { now: () => now },
  });
}

test('confirmation-time validation accepts the exact current action under DEC-001, matrix, and preconditions', async () => {
  const grant = await issueGrant();
  const result = await makeValidator().validate({ grant, actionCandidate: GRANT_ACTION });
  assert.equal(result.valid, true);
  assert.equal(result.reason, 'valid');
  assert.equal(result.policyVersion, SYNTHETIC_CONFIRMATION_MATRIX.version);
  assert.match(result.actionHash, /^[a-f0-9]{64}$/);
});

test('confirmation-time validation invalidates changed action, expired grants, matrix changes, and stale preconditions', async () => {
  const grant = await issueGrant();
  const changedTarget = await makeValidator().validate({
    grant, actionCandidate: { ...GRANT_ACTION, target: { id: 'synthetic-other', kind: 'task' } },
  });
  const changedPayload = await makeValidator().validate({
    grant, actionCandidate: { ...GRANT_ACTION, payload: { status: 'Backlog', note: 'synthetic' } },
  });
  const changedConversation = await makeValidator().validate({
    grant, actionCandidate: { ...GRANT_ACTION, conversationRef: 'synthetic-other-conversation' },
  });
  const expired = await makeValidator({ now: 200 }).validate({ grant, actionCandidate: GRANT_ACTION });
  const changedPolicy = await makeValidator({
    matrix: { ...SYNTHETIC_CONFIRMATION_MATRIX, version: 'synthetic-confirmation-matrix@2' },
  }).validate({ grant, actionCandidate: GRANT_ACTION });
  const stale = await makeValidator({ snapshot: { revision: 4, status: 'Backlog' } })
    .validate({ grant, actionCandidate: GRANT_ACTION });

  assert.equal(changedTarget.reason, 'action_changed');
  assert.equal(changedPayload.reason, 'action_changed');
  assert.equal(changedConversation.reason, 'action_changed');
  assert.equal(expired.reason, 'expired');
  assert.equal(changedPolicy.reason, 'policy_changed');
  assert.equal(stale.reason, 'stale');
});

test('closed access gate prevents validation and private precondition reads', async () => {
  const grant = await issueGrant();
  let validationCalls = 0;
  let preconditionReads = 0;
  const validator = createConfirmationGrantValidator({
    accessGate: { async allowsAction() { return false; } },
    matrixProvider: () => SYNTHETIC_CONFIRMATION_MATRIX,
    actionValidator: async action => { validationCalls += 1; return { valid: true, ...action, capability: 'synthetic.write' }; },
    currentPreconditionsProvider: async () => { preconditionReads += 1; return { available: true, snapshot: {} }; },
    clock: { now: () => 150 },
  });
  const result = await validator.validate({ grant, actionCandidate: GRANT_ACTION });
  assert.equal(result.reason, 'access_denied');
  assert.equal(validationCalls, 0);
  assert.equal(preconditionReads, 0);
});
