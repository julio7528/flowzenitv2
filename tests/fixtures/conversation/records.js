export const CONVERSATION_FIXTURE_VERSION = 1;

const fixture = {
  version: CONVERSATION_FIXTURE_VERSION,
  referenceTime: '2026-10-29T12:00:00.000Z',
  conversation: {
    conversationId: '00000000-0000-4000-8000-000000000101',
    lifecycle: 'active',
    createdAt: '2026-10-20T10:00:00.000Z',
    lastActivityAt: '2026-10-20T10:05:00.000Z',
    expiresAt: '2027-10-20T10:05:00.000Z',
    lastMessageSeq: '3',
    policyVersion: 'dec005-spec003-v1',
    activeTurnId: null,
  },
  messages: [
    {
      messageId: '00000000-0000-4000-8000-000000000201',
      conversationId: '00000000-0000-4000-8000-000000000101',
      messageSeq: '1',
      turnId: '00000000-0000-4000-8000-000000000301',
      idempotencyKey: 'synthetic-turn-001',
      role: 'user',
      content: 'Synthetic history page request.',
      createdAt: '2026-10-20T10:00:01.000Z',
    },
    {
      messageId: '00000000-0000-4000-8000-000000000202',
      conversationId: '00000000-0000-4000-8000-000000000101',
      messageSeq: '2',
      turnId: '00000000-0000-4000-8000-000000000301',
      idempotencyKey: 'synthetic-turn-001',
      role: 'assistant',
      content: 'Synthetic deterministic response.',
      createdAt: '2026-10-20T10:00:02.000Z',
    },
    {
      messageId: '00000000-0000-4000-8000-000000000203',
      conversationId: '00000000-0000-4000-8000-000000000101',
      messageSeq: '3',
      turnId: '00000000-0000-4000-8000-000000000302',
      idempotencyKey: 'synthetic-turn-002',
      role: 'tool_summary',
      content: 'Synthetic read result summary.',
      createdAt: '2026-10-20T10:05:00.000Z',
    },
  ],
  checkpoint: {
    conversationId: '00000000-0000-4000-8000-000000000101',
    threadId: '00000000-0000-4000-8000-000000000101',
    checkpointNs: 'agent',
    checkpointId: 'checkpoint-synthetic-003',
    parentCheckpointId: 'checkpoint-synthetic-002',
    graphVersion: 'flowzenit-agent-v1',
    stateSchemaVersion: 1,
    serializerVersion: 'langgraph-json-v1',
    turnId: '00000000-0000-4000-8000-000000000302',
    correlationId: '00000000-0000-4000-8000-000000000401',
    ledgerRefs: ['ledger-synthetic-read-001'],
    payloadDigest: 'sha256:6d5b4b196b0be1b5e70270552e541eaafc421ebf293d35473f45a0da21de0cf3',
    updatedAt: '2026-10-29T11:00:00.000Z',
    expiresAt: '2026-11-28T11:00:00.000Z',
  },
  ledger: {
    completed: {
      entryId: 'ledger-synthetic-read-001',
      turnId: '00000000-0000-4000-8000-000000000302',
      state: 'completed',
      responseRef: 'synthetic-response-001',
    },
    notStarted: {
      entryId: 'ledger-synthetic-read-002',
      turnId: '00000000-0000-4000-8000-000000000303',
      state: 'not_started',
    },
    uncertain: {
      entryId: 'ledger-synthetic-read-003',
      turnId: '00000000-0000-4000-8000-000000000304',
      state: 'uncertain',
    },
  },
  expiry: {
    conversationExpiredAt: '2026-10-28T10:00:00.000Z',
    checkpointExpiredAt: '2026-10-28T10:00:00.000Z',
    checkpointWithinThirtyDays: '2026-11-28T11:00:00.000Z',
  },
  corruption: {
    envelope: {
      conversationId: '00000000-0000-4000-8000-000000000101',
      checkpointId: 'checkpoint-synthetic-corrupt',
      graphVersion: 'flowzenit-agent-v1',
      stateSchemaVersion: 1,
      serializerVersion: 'langgraph-json-v1',
      turnId: '00000000-0000-4000-8000-000000000305',
      correlationId: '00000000-0000-4000-8000-000000000405',
      ledgerRefs: [],
      payloadDigest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      updatedAt: '2026-10-29T11:00:00.000Z',
      expiresAt: '2026-11-28T11:00:00.000Z',
    },
    checkpointPayload: { synthetic: 'digest does not match this payload' },
  },
  concurrentRequests: {
    identical: [
      { requestId: 'synthetic-request-a', idempotencyKey: 'synthetic-idempotency-same', payload: { message: 'Synthetic concurrent request.' } },
      { requestId: 'synthetic-request-b', idempotencyKey: 'synthetic-idempotency-same', payload: { message: 'Synthetic concurrent request.' } },
    ],
    divergent: [
      { idempotencyKey: 'synthetic-idempotency-conflict', payload: { message: 'Synthetic original request.' } },
      { idempotencyKey: 'synthetic-idempotency-conflict', payload: { message: 'Synthetic different request.' } },
    ],
  },
  deletionArtifacts: {
    conversationId: '00000000-0000-4000-8000-000000000101',
    messageIds: [
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000202',
      '00000000-0000-4000-8000-000000000203',
    ],
    turnIds: [
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000302',
    ],
    checkpointIds: ['checkpoint-synthetic-002', 'checkpoint-synthetic-003'],
    summaryIds: ['summary-synthetic-003'],
    deletionRequestId: '00000000-0000-4000-8000-000000000501',
  },
};

export function createConversationFixture() {
  return structuredClone(fixture);
}

export const CONVERSATION_FIXTURE = Object.freeze(fixture);
