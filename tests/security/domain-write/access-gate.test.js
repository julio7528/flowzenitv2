import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWriteCapabilityRegistry,
  WRITE_CAPABILITY_NAMES,
} from '../../../server/agent/tools/write-capabilities.js';
import { SYNTHETIC_WRITE_COMMANDS } from '../../fixtures/domain-write/commands.js';

test('allowlisted write capabilities remain unavailable until write dependencies are selected', async () => {
  let gateCalls = 0;
  const { registry } = createWriteCapabilityRegistry({
    accessGate: { allowsWrite: async () => { gateCalls += 1; return true; } },
  });
  assert.deepEqual([...registry.keys()], [...WRITE_CAPABILITY_NAMES]);
  assert.equal(registry.has('delete'), false);
  assert.throws(() => registry.set('delete', {}), /immutable/);
  assert.equal(registry.get('create_task').enabled, false);

  const result = await registry.get('create_task').execute(SYNTHETIC_WRITE_COMMANDS.createTask);
  assert.deepEqual(result, { status: 'unavailable', reason: 'write_dependencies_unselected' });
  assert.equal(gateCalls, 1, 'the server policy allows the POC request but no write handler is selected');
});

test('malformed or cross-operation inputs do not reach capability checks', async () => {
  let gateCalls = 0;
  const { registry } = createWriteCapabilityRegistry({
    accessGate: { allowsWrite: async () => { gateCalls += 1; return true; } },
  });
  const mismatch = await registry.get('create_demand').execute(SYNTHETIC_WRITE_COMMANDS.createTask);
  const malformed = await registry.get('create_task').execute({ ...SYNTHETIC_WRITE_COMMANDS.createTask, confirmationGrant: 'untrusted' });
  assert.deepEqual(mismatch, { status: 'denied', reason: 'invalid_command' });
  assert.deepEqual(malformed, { status: 'denied', reason: 'invalid_command' });
  assert.equal(gateCalls, 0);
});

test('an injected repository is not invoked when the server write gate denies the request', async () => {
  let repositoryCalls = 0;
  const writeRepository = {
    createTask: async () => { repositoryCalls += 1; throw new Error('must not run'); },
    createSubtask: async () => { repositoryCalls += 1; throw new Error('must not run'); },
  };
  const { registry } = createWriteCapabilityRegistry({
    accessGate: { allowsWrite: async () => false },
    writeRepository,
  });

  const result = await registry.get('create_task').handler({
    name: 'Synthetic task', parentId: '900000000000000001',
  });

  assert.equal(result.outcome, 'DENIED');
  assert.equal(result.reasonCategory, 'ACCESS_DISABLED');
  assert.equal(repositoryCalls, 0);
});
