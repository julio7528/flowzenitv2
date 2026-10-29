import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyntheticAgentRequest } from '../../fixtures/agentBoundary.js'
import { isAgentAccessGateOpen, withAgentAccess } from '../../../server/security/accessGate.js'

test('o gate de acesso privado permanece fechado sem configuração ou solicitação', () => {
  assert.equal(isAgentAccessGateOpen(), false)
  assert.equal(isAgentAccessGateOpen(true), false)
  assert.equal(isAgentAccessGateOpen({ enabled: true, verified: true }), false)
})

test('passkey, sessionStorage e campos do navegador não abrem o gate', () => {
  const request = createSyntheticAgentRequest({
    browserState: {
      passkeyUnlocked: true,
      sessionStorage: { passkeyVerified: 'true' },
    },
    headers: { 'x-client-authorized': 'true' },
    clientAuthorized: true,
  })

  assert.equal(isAgentAccessGateOpen(request), false)
  assert.deepEqual(withAgentAccess(request, async () => ({ privateRecord: true })), {
    ok: false,
    error: { code: 'CAPABILITY_DISABLED', message: 'Capability unavailable' },
  })
})

test('uma solicitação negada não chama a operação protegida', () => {
  let calls = 0
  const result = withAgentAccess(createSyntheticAgentRequest(), async () => {
    calls += 1
    return { privateRecord: true }
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CAPABILITY_DISABLED')
  assert.equal(calls, 0)
})
