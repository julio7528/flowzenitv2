import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONVERSATION_LIFECYCLE_STATES,
  createConversationLifecycle,
} from '../../../server/agent/memory/lifecycle.js';
import { memoryAccessGate } from '../../../server/agent/memory/access-gate.js';

const conversationId = '00000000-0000-4000-8000-000000000801';
const requestId = '00000000-0000-4000-8000-000000000802';
const otherRequestId = '00000000-0000-4000-8000-000000000803';
const turnId = '00000000-0000-4000-8000-000000000804';
const otherTurnId = '00000000-0000-4000-8000-000000000805';

class SyntheticLifecyclePool {
  constructor({ activeTurnId = null, reservations = [], checkpointEnvelopes = [], artifacts = {} } = {}) {
    this.conversation = {
      lifecycle: 'active',
      active_turn_id: activeTurnId,
      policy_version: 'dec005-spec003-v1',
    };
    this.reservations = reservations.map((row) => ({ ...row }));
    this.checkpointEnvelopes = checkpointEnvelopes.map((row) => ({ ...row }));
    this.operations = new Map();
    this.artifacts = {
      messages: 0,
      turn_reservations: 0,
      context_summaries: 0,
      checkpoint_envelopes: this.checkpointEnvelopes.length,
      checkpoints: this.checkpointEnvelopes.length,
      checkpoint_blobs: 0,
      checkpoint_writes: 0,
      ...artifacts,
    };
    this.calls = [];
  }

  async query() {
    throw new Error('Tests use a checked-out synthetic connection.');
  }

  async connect() {
    const pool = this;
    return {
      async query(sql, values = []) {
        pool.calls.push({ sql, values });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };

        if (sql.includes('FROM conversation_private.deletion_operations')
          && sql.includes('WHERE request_id = $1::uuid')
          && sql.includes('SELECT conversation_id, status')) {
          const [id] = values;
          const operation = pool.operations.get(id);
          return { rows: operation ? [{ conversation_id: operation.conversation_id, status: operation.status }] : [] };
        }

        if (sql.includes('FROM conversation_private.deletion_operations')
          && sql.includes('WHERE request_id = $1::uuid AND conversation_id = $2')) {
          const [id, requestedConversationId] = values;
          const operation = pool.operations.get(id);
          return {
            rows: operation?.conversation_id === requestedConversationId
              ? [{ status: operation.status }]
              : [],
          };
        }

        if (sql.includes('FROM conversation_private.deletion_operations')
          && sql.includes("status = 'deleting'")) {
          const [requestedConversationId] = values;
          const operation = [...pool.operations.entries()]
            .find(([, row]) => row.conversation_id === requestedConversationId && row.status === 'deleting');
          return { rows: operation ? [{ request_id: operation[0] }] : [] };
        }

        if (sql.includes('INSERT INTO conversation_private.deletion_operations')) {
          const [id, requestedConversationId] = values;
          if (pool.operations.has(id)) return { rows: [] };
          pool.operations.set(id, { conversation_id: requestedConversationId, status: 'deleting' });
          return { rows: [{ request_id: id }] };
        }

        if (sql.includes('FROM conversation_private.conversations')
          && sql.includes('FOR UPDATE')) {
          const [requestedConversationId] = values;
          if (requestedConversationId !== conversationId || pool.conversation === null) return { rows: [] };
          return { rows: [{ ...pool.conversation }] };
        }

        if (sql.includes("SET lifecycle = 'deleting'")) {
          pool.conversation.lifecycle = 'deleting';
          return { rows: [{ active_turn_id: pool.conversation.active_turn_id }] };
        }

        if (sql.includes('FROM conversation_private.turn_reservations')
          && sql.includes('SELECT turn_id::text AS turn_id, status')
          && sql.includes('FOR UPDATE')) {
          const [requestedConversationId, requestedTurnId] = values;
          if (requestedConversationId !== conversationId) return { rows: [] };
          return {
            rows: pool.reservations.filter((row) => (
              ['reserved', 'running', 'uncertain'].includes(row.status)
              || row.turn_id === requestedTurnId
            )).map((row) => ({ ...row })),
          };
        }

        if (sql.includes('LEFT JOIN conversation_private.checkpoint_envelopes')
          && sql.includes('e.checkpoint_id IS NULL')) {
          const count = Math.max(0, pool.artifacts.checkpoints - pool.artifacts.checkpoint_envelopes);
          return { rows: [{ count: String(count) }] };
        }

        if (sql.includes('FROM conversation_private.checkpoint_envelopes')
          && sql.includes('turn_id = ANY($2::uuid[])')
          && sql.includes('ledger_refs')) {
          const [requestedConversationId, requestedTurnIds] = values;
          const turnIds = new Set(requestedTurnIds);
          const rows = pool.checkpointEnvelopes.filter((row) => (
            row.thread_id === requestedConversationId && turnIds.has(row.turn_id)
          ));
          return { rows: rows.map((row) => ({ ...row })) };
        }

        if (sql.includes('UPDATE conversation_private.turn_reservations')
          && sql.includes("SET status = 'completed'")) {
          const [, requestedTurnId] = values;
          const row = pool.reservations.find((item) => item.turn_id === requestedTurnId);
          if (!row || !['reserved', 'running', 'uncertain'].includes(row.status)) return { rows: [] };
          row.status = 'completed';
          return { rows: [{ turn_id: row.turn_id }] };
        }

        if (sql.includes('UPDATE conversation_private.turn_reservations')
          && sql.includes("SET status = 'cancelled'")) {
          const [, requestedTurnId] = values;
          const row = pool.reservations.find((item) => item.turn_id === requestedTurnId);
          if (!row || !['reserved', 'running', 'uncertain'].includes(row.status)) return { rows: [] };
          row.status = 'cancelled';
          return { rows: [{ turn_id: row.turn_id }] };
        }

        if (sql.includes('SELECT status FROM conversation_private.turn_reservations')) {
          const [, requestedTurnId] = values;
          const row = pool.reservations.find((item) => item.turn_id === requestedTurnId);
          return { rows: row ? [{ status: row.status }] : [] };
        }

        if (sql.includes("SET active_turn_id = NULL")) {
          pool.conversation.active_turn_id = null;
          return { rows: [{ active_turn_id: null }] };
        }

        if (sql.includes('SELECT COUNT(*)::text AS count')
          && sql.includes('FROM conversation_private.turn_reservations')) {
          const count = pool.reservations.filter((row) => (
            ['reserved', 'running', 'uncertain'].includes(row.status)
          )).length;
          return { rows: [{ count: String(count) }] };
        }

        if (sql.includes('AS messages') && sql.includes('AS checkpoint_writes')) {
          return {
            rows: [{
              ...pool.artifacts,
              turn_reservations: Math.max(pool.artifacts.turn_reservations, pool.reservations.length),
            }],
          };
        }

        if (sql.includes("SET lifecycle = 'deleted'")) {
          pool.conversation.lifecycle = 'deleted';
          return { rows: [{ conversation_id: conversationId }] };
        }

        if (sql.includes('DELETE FROM conversation_private.conversations')) {
          const [requestedConversationId] = values;
          if (requestedConversationId !== conversationId || pool.conversation === null) return { rows: [] };
          pool.conversation = null;
          return { rows: [{ conversation_id: conversationId }] };
        }

        if (sql.includes("SET status = 'completed'")) {
          const [id, requestedConversationId] = values;
          const operation = pool.operations.get(id);
          if (!operation || operation.conversation_id !== requestedConversationId) return { rows: [] };
          operation.status = 'completed';
          return { rows: [{ request_id: id }] };
        }

        pool.unexpected = sql;
        throw new Error(`Unexpected synthetic query: ${sql}`);
      },
      release() {},
    };
  }
}

function syntheticLedger(result = { status: 'not_started' }) {
  const calls = [];
  return {
    calls,
    async reserve() { return { status: 'reserved' }; },
    async recordStarted() { return { acknowledged: true }; },
    async recordOutcome() { return { acknowledged: true }; },
    async lookup(key) { calls.push(key); return result; },
  };
}

function createLifecycle(pool, {
  ledger = syntheticLedger(),
  cancelResult = { outcome: 'NOT_FOUND' },
  accessGate = { run: (operation) => operation() },
} = {}) {
  const cancelCalls = [];
  const lifecycle = createConversationLifecycle({
    pool,
    executionLedger: ledger,
    turnCoordinator: {
      async cancelConversation(id) { cancelCalls.push(id); return cancelResult; },
    },
    accessGate,
  });
  return { lifecycle, ledger, cancelCalls };
}

test('lifecycle exposes only active, deleting, and deleted states', () => {
  assert.deepEqual(CONVERSATION_LIFECYCLE_STATES, ['active', 'deleting', 'deleted']);
  assert.equal(CONVERSATION_LIFECYCLE_STATES.includes('soft_deleted'), false);
  assert.equal(CONVERSATION_LIFECYCLE_STATES.includes('recoverable'), false);
});

test('beginDeletion atomically enters deleting and is idempotent for the same request', async () => {
  const pool = new SyntheticLifecyclePool();
  const { lifecycle } = createLifecycle(pool);

  assert.deepEqual(await lifecycle.beginDeletion({ conversationId, requestId }), {
    outcome: 'DELETING', activeTurn: false,
  });
  assert.equal(pool.conversation.lifecycle, 'deleting');
  assert.deepEqual(await lifecycle.beginDeletion({ conversationId, requestId }), {
    outcome: 'DELETING', activeTurn: false,
  });
  assert.equal(pool.operations.size, 1);
});

test('a different deletion request conflicts while a conversation is already deleting', async () => {
  const pool = new SyntheticLifecyclePool();
  const { lifecycle } = createLifecycle(pool);

  await lifecycle.beginDeletion({ conversationId, requestId });
  assert.deepEqual(await lifecycle.beginDeletion({ conversationId, requestId: otherRequestId }), {
    outcome: 'CONFLICT',
  });
  assert.equal(pool.operations.size, 1);
  assert.equal(pool.conversation.lifecycle, 'deleting');
});

test('default closed DEC-001 gate denies lifecycle operations before any private SQL or cancellation', async () => {
  const pool = new SyntheticLifecyclePool({ activeTurnId: turnId });
  const { lifecycle, cancelCalls } = createLifecycle(pool, { accessGate: memoryAccessGate });

  assert.deepEqual(await lifecycle.beginDeletion({ conversationId, requestId }), { outcome: 'ACCESS_DISABLED' });
  assert.deepEqual(await lifecycle.reconcileActiveTurn({ conversationId, requestId }), { outcome: 'ACCESS_DISABLED' });
  assert.deepEqual(await lifecycle.completeDeletion({ conversationId, requestId }), { outcome: 'ACCESS_DISABLED' });
  assert.equal(pool.calls.length, 0);
  assert.deepEqual(cancelCalls, []);
});

test('reconciliation leaves deleting inaccessible when the durable ledger is uncertain', async () => {
  const pool = new SyntheticLifecyclePool({
    activeTurnId: turnId,
    reservations: [{ turn_id: turnId, idempotency_key: 'synthetic-ledger-key-1', status: 'running' }],
    checkpointEnvelopes: [{
      thread_id: conversationId,
      turn_id: turnId,
      ledger_refs: ['synthetic-envelope-ledger-ref-1'],
    }],
  });
  const ledger = syntheticLedger({ status: 'uncertain' });
  const { lifecycle, cancelCalls } = createLifecycle(pool, {
    ledger,
    cancelResult: { outcome: 'CANCELLED' },
    accessGate: { run: (operation) => operation() },
  });

  await lifecycle.beginDeletion({ conversationId, requestId });
  assert.deepEqual(await lifecycle.reconcileActiveTurn({ conversationId, requestId }), {
    outcome: 'LEDGER_UNRESOLVED',
  });
  assert.equal(pool.conversation.lifecycle, 'deleting');
  assert.equal(pool.conversation.active_turn_id, turnId);
  assert.equal(pool.reservations[0].status, 'running');
  assert.deepEqual(cancelCalls, [conversationId]);
  assert.deepEqual(ledger.calls, ['synthetic-envelope-ledger-ref-1']);
});

test('an active turn without a durable envelope stays deleting and cannot be purged or completed', async () => {
  const pool = new SyntheticLifecyclePool({
    activeTurnId: turnId,
    reservations: [{ turn_id: turnId, idempotency_key: 'request-idempotency-only', status: 'running' }],
    artifacts: { checkpoints: 1 },
  });
  const ledger = syntheticLedger({ status: 'not_started' });
  const { lifecycle } = createLifecycle(pool, {
    ledger,
    cancelResult: { outcome: 'CANCELLED' },
  });

  await lifecycle.beginDeletion({ conversationId, requestId });
  assert.deepEqual(await lifecycle.reconcileActiveTurn({ conversationId, requestId }), {
    outcome: 'LEDGER_UNRESOLVED',
  });
  assert.deepEqual(await lifecycle.completeDeletion({ conversationId, requestId }), {
    outcome: 'LEDGER_UNRESOLVED',
  });
  assert.equal(pool.conversation.lifecycle, 'deleting');
  assert.equal(pool.conversation.active_turn_id, turnId);
  assert.equal(pool.operations.get(requestId).status, 'deleting');
  assert.notEqual(pool.conversation, null);
  assert.equal(pool.artifacts.checkpoints, 1);
  assert.deepEqual(ledger.calls, []);
});

test('inconclusive ledger lookup for an envelope linked to the active turn blocks completion', async () => {
  const pool = new SyntheticLifecyclePool({
    activeTurnId: turnId,
    reservations: [{ turn_id: turnId, idempotency_key: 'request-idempotency-only', status: 'running' }],
    checkpointEnvelopes: [{
      thread_id: conversationId,
      turn_id: turnId,
      ledger_refs: ['durable-turn-ledger-reference'],
    }],
  });
  const ledger = syntheticLedger(null);
  const { lifecycle } = createLifecycle(pool, {
    ledger,
    cancelResult: { outcome: 'CANCELLED' },
  });

  await lifecycle.beginDeletion({ conversationId, requestId });
  assert.deepEqual(await lifecycle.reconcileActiveTurn({ conversationId, requestId }), {
    outcome: 'LEDGER_UNRESOLVED',
  });
  assert.deepEqual(await lifecycle.completeDeletion({ conversationId, requestId }), {
    outcome: 'LEDGER_UNRESOLVED',
  });
  assert.equal(pool.conversation.lifecycle, 'deleting');
  assert.equal(pool.conversation.active_turn_id, turnId);
  assert.equal(pool.operations.get(requestId).status, 'deleting');
  assert.deepEqual(ledger.calls, ['durable-turn-ledger-reference']);
});

test('active-turn and reservation mismatches remain unresolved and cannot complete deletion', async () => {
  const cases = [
    {
      name: 'active pointer has no matching reservation',
      activeTurnId: turnId,
      reservations: [{ turn_id: otherTurnId, idempotency_key: 'request-idempotency-only', status: 'running' }],
    },
    {
      name: 'active reservation has no conversation pointer',
      activeTurnId: null,
      reservations: [{ turn_id: turnId, idempotency_key: 'request-idempotency-only', status: 'running' }],
    },
  ];

  for (const scenario of cases) {
    const pool = new SyntheticLifecyclePool({
      activeTurnId: scenario.activeTurnId,
      reservations: scenario.reservations,
      artifacts: { turn_reservations: 1 },
    });
    const ledger = syntheticLedger({ status: 'not_started' });
    const { lifecycle, cancelCalls } = createLifecycle(pool, {
      ledger,
      cancelResult: { outcome: 'CANCELLED' },
    });

    await lifecycle.beginDeletion({ conversationId, requestId });
    assert.deepEqual(await lifecycle.reconcileActiveTurn({ conversationId, requestId }), {
      outcome: 'LEDGER_UNRESOLVED',
    }, scenario.name);
    const completed = await lifecycle.completeDeletion({ conversationId, requestId });
    assert.notEqual(completed.outcome, 'DELETED', scenario.name);
    assert.equal(pool.operations.get(requestId).status, 'deleting', scenario.name);
    assert.equal(pool.conversation.lifecycle, 'deleting', scenario.name);
    assert.notEqual(pool.conversation, null, scenario.name);
    assert.deepEqual(ledger.calls, [], scenario.name);
    assert.deepEqual(cancelCalls, [conversationId], scenario.name);
  }
});

test('not-started ledger outcome cancels a reserved turn and permits purge preflight', async () => {
  const pool = new SyntheticLifecyclePool({
    activeTurnId: turnId,
    reservations: [{ turn_id: turnId, idempotency_key: 'synthetic-ledger-key-2', status: 'reserved' }],
    checkpointEnvelopes: [{
      thread_id: conversationId,
      turn_id: turnId,
      ledger_refs: ['synthetic-envelope-ledger-ref-2'],
    }],
  });
  const ledger = syntheticLedger({ status: 'not_started' });
  const { lifecycle } = createLifecycle(pool, {
    ledger,
    cancelResult: { outcome: 'CANCELLED' },
    accessGate: { run: (operation) => operation() },
  });

  await lifecycle.beginDeletion({ conversationId, requestId });
  const reconciled = await lifecycle.reconcileActiveTurn({ conversationId, requestId });
  assert.deepEqual(reconciled, {
    outcome: 'READY_FOR_PURGE',
  }, JSON.stringify({ unexpected: pool.unexpected, queries: pool.calls.map(({ sql }) => sql) }));
  assert.equal(pool.conversation.lifecycle, 'deleting');
  assert.equal(pool.conversation.active_turn_id, null);
  assert.equal(pool.reservations[0].status, 'cancelled');
  assert.deepEqual(ledger.calls, ['synthetic-envelope-ledger-ref-2']);
});

test('completeDeletion cannot mark deleted while a turn is active or any recoverable artifacts remain', async () => {
  const activePool = new SyntheticLifecyclePool({ activeTurnId: turnId });
  const active = createLifecycle(activePool, { accessGate: { run: (operation) => operation() } }).lifecycle;
  await active.beginDeletion({ conversationId, requestId });
  assert.deepEqual(await active.completeDeletion({ conversationId, requestId }), {
    outcome: 'LEDGER_UNRESOLVED',
  });
  assert.equal(activePool.conversation.lifecycle, 'deleting');

  const artifactPool = new SyntheticLifecyclePool({ artifacts: { checkpoints: 1 } });
  const withArtifacts = createLifecycle(artifactPool, { accessGate: { run: (operation) => operation() } }).lifecycle;
  await withArtifacts.beginDeletion({ conversationId, requestId });
  assert.deepEqual(await withArtifacts.completeDeletion({ conversationId, requestId }), {
    outcome: 'ARTIFACTS_REMAIN',
    artifacts: {
      messages: 0,
      turn_reservations: 0,
      context_summaries: 0,
      checkpoint_envelopes: 0,
      checkpoints: 1,
      checkpoint_blobs: 0,
      checkpoint_writes: 0,
    },
  });
  assert.equal(artifactPool.conversation.lifecycle, 'deleting');
});

test('deleted is terminal and is recorded only after all artifact counts are zero', async () => {
  const pool = new SyntheticLifecyclePool();
  const { lifecycle } = createLifecycle(pool, { accessGate: { run: (operation) => operation() } });

  await lifecycle.beginDeletion({ conversationId, requestId });
  assert.deepEqual(await lifecycle.reconcileActiveTurn({ conversationId, requestId }), {
    outcome: 'READY_FOR_PURGE',
  });
  assert.deepEqual(await lifecycle.completeDeletion({ conversationId, requestId }), {
    outcome: 'DELETED',
    artifacts: {
      messages: 0,
      turn_reservations: 0,
      context_summaries: 0,
      checkpoint_envelopes: 0,
      checkpoints: 0,
      checkpoint_blobs: 0,
      checkpoint_writes: 0,
    },
  });
  assert.equal(pool.conversation, null);
  assert.deepEqual(await lifecycle.beginDeletion({ conversationId, requestId }), { outcome: 'DELETED' });
  assert.equal(pool.operations.size, 1);
  assert.equal(pool.operations.get(requestId).status, 'completed');
  const completion = pool.calls.find(({ sql }) => (
    sql.includes('UPDATE conversation_private.deletion_operations')
      && sql.includes("SET status = 'completed'")
  ));
  assert.ok(completion, 'completion operation should be durably timestamped');
  assert.match(completion.sql, /completed_at = statement_timestamp\(\)/);
  assert.match(completion.sql, /updated_at = statement_timestamp\(\)/);
  assert.match(completion.sql, /purge_after = statement_timestamp\(\) \+ interval '30 days'/);
});
