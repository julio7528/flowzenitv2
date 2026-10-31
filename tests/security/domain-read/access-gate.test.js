import test from 'node:test'
import assert from 'node:assert/strict'
import { withDomainReadAccess } from '../../../server/domain/read/access.js'

test('o gate público de POC executa a operação de leitura do servidor mesmo sem passkey', async () => {
  let repositoryCalls = 0
  const request = {
    operation: 'getItemById',
    itemId: 'synthetic-record-id',
    accessDecision: 'deny',
    browserState: { passkeyUnlocked: false },
  }

  const result = await withDomainReadAccess(request, async () => {
    repositoryCalls += 1
    return { items: [{ id: 'synthetic-public-record' }] }
  })

  assert.deepEqual(result, { items: [{ id: 'synthetic-public-record' }] })
  assert.equal(repositoryCalls, 1)
})
