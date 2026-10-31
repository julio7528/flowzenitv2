export const SYNTHETIC_LEDGER_CASES = Object.freeze({
  reserved: Object.freeze({ state: 'reserved', key: 'synthetic-key-001', commandHash: 'a'.repeat(64) }),
  completed: Object.freeze({
    state: 'completed',
    key: 'synthetic-key-001',
    commandHash: 'a'.repeat(64),
    outcome: Object.freeze({ outcome: 'COMMITTED', persistentId: '900000000000000003' }),
  }),
  conflictingHash: Object.freeze({ state: 'conflict', key: 'synthetic-key-001', commandHash: 'b'.repeat(64) }),
  uncertain: Object.freeze({ state: 'uncertain', key: 'synthetic-key-002', commandHash: 'c'.repeat(64) }),
});
