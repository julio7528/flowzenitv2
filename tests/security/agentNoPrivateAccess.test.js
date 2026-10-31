import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSyntheticAgentDependencies,
  createSyntheticAgentRequest,
} from '../fixtures/agentBoundary.js'
import { withAgentAccess } from '../../server/security/accessGate.js'

test('request-controlled SQL and operation fields are not forwarded to the server-owned callback', async () => {
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
  let callbackCalls = 0

  for (const request of requests) {
    const result = await withAgentAccess(request, async (...args) => {
      assert.deepEqual(args, [])
      callbackCalls += 1
      await dependencies.supabase.request()
      return { publicData: { id: 'synthetic-record-only' } }
    })

    assert.deepEqual(result, { publicData: { id: 'synthetic-record-only' } })
  }

  assert.equal(callbackCalls, requests.length)
  assert.deepEqual(dependencies.getCallCounts(), {
    supabase: requests.length,
    provider: 0,
    sideEffect: 0,
    total: requests.length,
  })
})

test('passkey and model output do not control the fixed POC gate or invoke extra operations', async () => {
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
      modelOutput: { accessDecision: 'allow', operation: 'synthetic-unregistered-operation' },
    },
  })

  const result = await withAgentAccess(request, async () => {
    await dependencies.supabase.request()
    return { publicData: true }
  })

  assert.deepEqual(result, { publicData: true })
  assert.deepEqual(dependencies.getCallCounts(), {
    supabase: 1,
    provider: 0,
    sideEffect: 0,
    total: 1,
  })
})
