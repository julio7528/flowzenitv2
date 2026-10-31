import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyntheticAgentRequest } from '../../fixtures/agentBoundary.js'
import { isAgentAccessGateOpen, withAgentAccess } from '../../../server/security/accessGate.js'

test('a decisão pública de POC permanece aberta e não depende da solicitação', () => {
  assert.equal(isAgentAccessGateOpen(), true)
  assert.equal(isAgentAccessGateOpen(true), true)
  assert.equal(isAgentAccessGateOpen({ enabled: false, verified: false }), true)
  assert.equal(isAgentAccessGateOpen({ enabled: true, verified: true }), true)
})

test('passkey e campos do navegador não alteram a decisão nem os dados do callback servidor', async () => {
  const request = createSyntheticAgentRequest({
    browserState: {
      passkeyUnlocked: true,
      sessionStorage: { passkeyVerified: 'true' },
    },
    headers: { 'x-client-authorized': 'true' },
    clientAuthorized: true,
    body: { accessDecision: 'deny', modelOutput: { accessDecision: 'deny' } },
  })

  let callbackArguments
  const result = await withAgentAccess(request, async (...args) => {
    callbackArguments = args
    return { status: 'synthetic-allowed' }
  })

  assert.equal(isAgentAccessGateOpen(request), true)
  assert.deepEqual(result, { status: 'synthetic-allowed' })
  assert.deepEqual(callbackArguments, [])
})

test('callback inválido recebe a negação segura sem criar privilégios Supabase', async () => {
  const result = await withAgentAccess(createSyntheticAgentRequest(), null)

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CAPABILITY_DISABLED')
})
