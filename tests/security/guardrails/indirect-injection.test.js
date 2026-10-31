import assert from 'node:assert/strict';
import test from 'node:test';
import { createSideEffectSpy } from '../../unit/guardrails/test-helpers.js';
import { INDIRECT_INJECTION_FIXTURES } from '../../fixtures/security/indirect-injection.js';
import { createUntrustedContentSegment, toUntrustedPromptSegments } from '../../../server/agent/guardrails/untrusted-content.js';
import { productionPolicyEvaluator } from '../../../server/agent/guardrails/policy.js';

const SOURCE_KIND_BY_FIXTURE = Object.freeze({
  domain_record: 'retrieval',
  memory: 'memory',
  web: 'web',
  provider: 'provider',
});

test('indirect injections from records, memory, web, and provider results remain inert data', async () => {
  const effects = createSideEffectSpy();

  for (const fixture of INDIRECT_INJECTION_FIXTURES) {
    const segment = createUntrustedContentSegment({
      sourceKind: SOURCE_KIND_BY_FIXTURE[fixture.source],
      sourceRef: `synthetic:${fixture.id}`,
      text: fixture.text,
    });
    const [promptPart] = toUntrustedPromptSegments([segment]);
    assert.equal(promptPart.text, fixture.text);
    assert.equal(promptPart.sourceKind, SOURCE_KIND_BY_FIXTURE[fixture.source]);

    const decision = await productionPolicyEvaluator.evaluate({
      operationName: 'private.read', operationVersion: '1',
      accessDecision: 'allow', modelApproved: true,
    });
    if (decision.outcome === 'ALLOW') effects.invoke('private.read@1');
    assert.equal(decision.outcome, 'DENY');
  }

  assert.equal(effects.total, 0);
});
