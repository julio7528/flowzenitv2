import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentTurnRequestSchema } from '../../../server/agent/runtime/state.js';
import {
  assertRequestBodyWithinLimit,
  RUNTIME_LIMITS,
} from '../../../server/agent/runtime/limits.js';

function priorMessages(count) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `synthetic prior message ${index + 1}`,
  }));
}

function requestWith(activeChatMessages) {
  return { message: 'synthetic current question', activeChatMessages };
}

test('accepts up to eight prior user and assistant messages from the active chat', () => {
  const result = AgentTurnRequestSchema.safeParse(requestWith(priorMessages(8)));

  assert.equal(result.success, true);
  assert.equal(result.data.activeChatMessages.length, 8);
});

test('rejects more than eight prior messages', () => {
  assert.equal(AgentTurnRequestSchema.safeParse(requestWith(priorMessages(9))).success, false);
});

test('rejects unsupported roles and invalid or empty message content', () => {
  for (const role of ['system', 'tool', 'developer', '']) {
    assert.equal(
      AgentTurnRequestSchema.safeParse(requestWith([{ role, content: 'synthetic content' }])).success,
      false,
      `role ${JSON.stringify(role)} must be rejected`,
    );
  }

  for (const content of ['', '   ', 7, null]) {
    assert.equal(
      AgentTurnRequestSchema.safeParse(requestWith([{ role: 'user', content }])).success,
      false,
      `content ${JSON.stringify(content)} must be rejected`,
    );
  }
});

test('rejects extra request and active-chat message fields', () => {
  assert.equal(AgentTurnRequestSchema.safeParse({
    ...requestWith([]),
    model: 'synthetic-untrusted-choice',
  }).success, false);

  assert.equal(AgentTurnRequestSchema.safeParse(requestWith([{
    role: 'user',
    content: 'synthetic content',
    toolName: 'searchItems',
  }])).success, false);
});

test('the complete UTF-8 request body accepts exactly 8,192 bytes and rejects byte 8,193', () => {
  const request = requestWith([{ role: 'user', content: '' }]);
  const emptyBody = JSON.stringify(request);
  const contentBytes = RUNTIME_LIMITS.maxRequestBytes - Buffer.byteLength(emptyBody, 'utf8');
  request.activeChatMessages[0].content = 'a'.repeat(contentBytes);
  const exactBody = JSON.stringify(request);

  assert.equal(Buffer.byteLength(exactBody, 'utf8'), RUNTIME_LIMITS.maxRequestBytes);
  assert.equal(assertRequestBodyWithinLimit(exactBody), RUNTIME_LIMITS.maxRequestBytes);
  assert.throws(() => assertRequestBodyWithinLimit(`${exactBody} `), {
    code: 'RUNTIME_LIMIT_EXCEEDED',
  });
});
