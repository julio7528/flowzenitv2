import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSyntheticAgentDependencies,
  createSyntheticAgentRequest,
} from '../fixtures/agentBoundary.js'
import { withAgentAccess } from '../../server/security/accessGate.js'

test('protected requests remain denied and cause no private downstream calls or side effects', async () => {
  const dependencies = createSyntheticAgentDependencies()
  const requests = [
    createSyntheticAgentRequest(),
    createSyntheticAgentRequest({
      body: {
        operation: 'synthetic-query',
        sql: 'select * from public.demands',
        table: 'public.demands',
        columns: ['*'],
      },
    }),
    createSyntheticAgentRequest({ body: { operation: 'synthetic-privileged-write' } }),
  ]

  for (const request of requests) {
    const result = await withAgentAccess(request, async () => {
      await dependencies.supabase.request()
      await dependencies.provider.request()
      await dependencies.sideEffect()
      return { privateRecord: { id: 'synthetic-record-only' } }
    })

    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'CAPABILITY_DISABLED')
    assert.equal('privateRecord' in result, false)
  }

  assert.deepEqual(dependencies.getCallCounts(), {
    supabase: 0,
    provider: 0,
    sideEffect: 0,
    total: 0,
  })
})

test('browser passkey state cannot authorize raw SQL, table, or column proposals', async () => {
  const dependencies = createSyntheticAgentDependencies()
  const request = createSyntheticAgentRequest({
    browserState: {
      passkeyUnlocked: true,
      sessionStorage: { passkeyVerified: 'true' },
    },
    body: {
      operation: 'synthetic-query',
      sql: 'select synthetic_column from public.synthetic_table',
      table: 'public.synthetic_table',
      columns: ['synthetic_column'],
    },
  })

  const result = await withAgentAccess(request, async () => {
    await dependencies.supabase.request()
    return { privateRecord: true }
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CAPABILITY_DISABLED')
  assert.equal('privateRecord' in result, false)
  assert.deepEqual(dependencies.getCallCounts(), {
    supabase: 0,
    provider: 0,
    sideEffect: 0,
    total: 0,
  })
})
