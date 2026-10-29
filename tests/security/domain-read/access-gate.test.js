import test from 'node:test'
import assert from 'node:assert/strict'
import { withDomainReadAccess } from '../../../server/domain/read/access.js'

test('gate fechado retorna ACCESS_DISABLED antes de chamar o repositório', async () => {
  let repositoryCalls = 0
  const request = {
    operation: 'getItemById',
    itemId: 'synthetic-record-id',
    browserState: { passkeyUnlocked: true },
  }

  const result = await withDomainReadAccess(request, async () => {
    repositoryCalls += 1
    return { items: [{ id: 'synthetic-private-record' }] }
  })

  assert.deepEqual(result, {
    error: {
      code: 'ACCESS_DISABLED',
      message: 'Read capability unavailable',
    },
  })
  assert.equal(repositoryCalls, 0)
})
