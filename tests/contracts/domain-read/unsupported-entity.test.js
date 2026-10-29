import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnsupportedEntityResponse,
  createDomainReadTools,
  DOMAIN_READ_TOOL_NAMES,
} from '../../../server/domain/read/index.js';

function allObjectKeys(value, keys = []) {
  if (value === null || typeof value !== 'object') return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    allObjectKeys(child, keys);
  }
  return keys;
}

test('unsupported commitment and calendar requests return a typed capability response', () => {
  for (const requestedEntity of ['commitment', 'calendar']) {
    const result = createUnsupportedEntityResponse(requestedEntity);

    assert.deepEqual(Object.keys(result), ['error']);
    assert.equal(result.error.code, 'UNSUPPORTED_ENTITY');
    assert.equal(result.error.requestedEntity, requestedEntity);
    assert.equal(typeof result.error.message, 'string');
    assert.ok(result.error.message.trim().length > 0);
    assert.match(result.error.message, /independent|independente/i);
    assert.match(result.error.message, /commitment|compromisso|calendar|calend/i);
    assert.ok(Array.isArray(result.error.supportedEntities));
    assert.ok(result.error.supportedEntities.includes('demand'));
    assert.ok(result.error.supportedEntities.includes('task'));
    assert.ok(result.error.supportedEntities.includes('subtask'));
    assert.ok(result.error.supportedEntities.includes('routineTemplate'));
    assert.equal(result.error.supportedEntities.includes('commitment'), false);
    assert.equal(result.error.supportedEntities.includes('calendar'), false);
    assert.deepEqual(allObjectKeys(result).filter((key) => /(?:^|_)id$/i.test(key)), []);
  }
});

test('unsupported capability response is reusable without adding a seventh read tool or requiring a repository', () => {
  let repositoryEffects = 0;
  const repository = {
    async getItemById() { repositoryEffects += 1; return null; },
    async getChildren() { repositoryEffects += 1; return { items: [], hasMore: false, nextCursor: null }; },
    async searchItems() { repositoryEffects += 1; return { items: [], hasMore: false, nextCursor: null }; },
    async insert() { repositoryEffects += 1; },
    async update() { repositoryEffects += 1; },
    async delete() { repositoryEffects += 1; },
  };
  const tools = createDomainReadTools(repository);

  const result = createUnsupportedEntityResponse('commitment');

  assert.equal(DOMAIN_READ_TOOL_NAMES.length, 6);
  assert.deepEqual(Object.keys(tools), [...DOMAIN_READ_TOOL_NAMES]);
  assert.equal(DOMAIN_READ_TOOL_NAMES.includes('createUnsupportedEntityResponse'), false);
  assert.equal(DOMAIN_READ_TOOL_NAMES.includes('getCommitments'), false);
  assert.equal(repositoryEffects, 0);
  assert.deepEqual(result, createUnsupportedEntityResponse('commitment'));
});
