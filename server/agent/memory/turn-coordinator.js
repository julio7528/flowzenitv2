import { createHash } from 'node:crypto';
import { assertExecutionLedgerPort } from '../persistence/ports.js';
import { assertRequestBodyWithinLimit, assertResponseBodyWithinLimit } from '../runtime/limits.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { memoryAccessGate } from './access-gate.js';
import { assertConversationRepository } from './conversation-repository.js';
import { validateConversationId, validateTurnId } from './conversation-contracts.js';

assertServerOnlyRuntime();

export const TURN_COORDINATOR_OUTCOMES = Object.freeze([
  'ACCESS_DISABLED',
  'INVALID_REQUEST',
  'CONFLICT',
  'REPLAYED',
  'COMPLETED',
  'NEEDS_CLARIFICATION',
  'DENIED',
  'REFUSED',
  'CANCELLED',
  'TIMED_OUT',
  'FAILED',
  'LEDGER_UNRESOLVED',
  'NOT_FOUND',
  'CONVERSATION_DELETING',
  'EXPIRED',
  'DEPENDENCY_UNAVAILABLE',
]);

const ACCESS_DISABLED = Object.freeze({ outcome: 'ACCESS_DISABLED' });
const INVALID_REQUEST = Object.freeze({ outcome: 'INVALID_REQUEST' });
const CONFLICT = Object.freeze({ outcome: 'CONFLICT' });
const LEDGER_UNRESOLVED = Object.freeze({ outcome: 'LEDGER_UNRESOLVED' });
const DEPENDENCY_UNAVAILABLE = Object.freeze({ outcome: 'DEPENDENCY_UNAVAILABLE' });
const SAFE_LEDGER_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const TERMINAL_OUTCOME_MAP = Object.freeze({
  completed: 'COMPLETED',
  'needs-clarification': 'NEEDS_CLARIFICATION',
  denied: 'DENIED',
  refused: 'REFUSED',
  'timed-out': 'TIMED_OUT',
  cancelled: 'CANCELLED',
  failed: 'FAILED',
});

const CANCELLATION_MESSAGE = 'This turn was cancelled.';
const FAILURE_MESSAGE = 'This turn could not be completed.';

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && Object.getOwnPropertySymbols(value).length === 0
      && Object.values(Object.getOwnPropertyDescriptors(value))
        .every((descriptor) => Object.hasOwn(descriptor, 'value'));
  } catch {
    return false;
  }
}

function ownValue(value, key) {
  if (!isPlainRecord(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function parseRequest(value) {
  if (!isPlainRecord(value)) return null;
  const allowedKeys = new Set([
    'conversationId', 'turnId', 'correlationId', 'idempotencyKey', 'message',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  try {
    const conversationId = validateConversationId(ownValue(value, 'conversationId'));
    const turnId = validateTurnId(ownValue(value, 'turnId'));
    const correlationId = validateTurnId(ownValue(value, 'correlationId'));
    const idempotencyKey = ownValue(value, 'idempotencyKey');
    const message = ownValue(value, 'message');
    if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
      || typeof message !== 'string' || message.trim().length === 0 || message.includes('\0')
      ) {
      return null;
    }
    assertRequestBodyWithinLimit(JSON.stringify({ message }));

    return Object.freeze({
      conversationId,
      turnId,
      correlationId,
      idempotencyKey,
      message,
      payloadHash: createHash('sha256').update(JSON.stringify({ message }), 'utf8').digest('hex'),
    });
  } catch {
    return null;
  }
}

function parseTrustedContext(value) {
  if (value === undefined) return Object.freeze({ ledgerRefs: Object.freeze([]), signal: undefined });
  if (!isPlainRecord(value)
    || Object.keys(value).some((key) => !['ledgerRefs', 'signal'].includes(key))) return null;
  const suppliedLedgerRefs = ownValue(value, 'ledgerRefs');
  const ledgerRefs = suppliedLedgerRefs === undefined ? [] : suppliedLedgerRefs;
  if (!Array.isArray(ledgerRefs) || ledgerRefs.length > 64
    || ledgerRefs.some((reference) => typeof reference !== 'string' || !SAFE_LEDGER_REFERENCE.test(reference))) {
    return null;
  }
  const signal = ownValue(value, 'signal');
  if (signal !== undefined && (!signal || typeof signal !== 'object'
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function')) return null;
  return Object.freeze({ ledgerRefs: Object.freeze([...new Set(ledgerRefs)]), signal });
}

function isAccessDenied(value) {
  return ownValue(value, 'outcome') === 'ACCESS_DISABLED'
    || ownValue(ownValue(value, 'error'), 'code') === 'ACCESS_DISABLED';
}

async function runThroughGate(accessGate, operation) {
  try {
    const result = await accessGate.run(operation);
    if (isAccessDenied(result)) return ACCESS_DISABLED;
    return result;
  } catch {
    return DEPENDENCY_UNAVAILABLE;
  }
}

/** Serialize work in one process; the repository's row lock serializes across instances. */
function createConversationQueue() {
  const tails = new Map();

  async function run(conversationId, operation) {
    const previous = tails.get(conversationId) ?? Promise.resolve();
    let release;
    const hold = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => hold);
    tails.set(conversationId, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (tails.get(conversationId) === tail) tails.delete(conversationId);
    }
  }

  return Object.freeze({ run });
}

function parseLedgerResult(ledgerRef, result) {
  if (!isPlainRecord(result)) return null;
  const status = ownValue(result, 'status');
  if (status === 'not_started') return Object.freeze({ ledgerRef, status });
  if (status === 'completed') {
    const safeOutcomeReference = ownValue(result, 'safeOutcomeReference');
    if (typeof safeOutcomeReference !== 'string' || !SAFE_LEDGER_REFERENCE.test(safeOutcomeReference)) return null;
    return Object.freeze({ ledgerRef, status, safeOutcomeReference });
  }
  return null;
}

async function inspectLedger(ledger, ledgerRefs) {
  const outcomes = [];
  for (const ledgerRef of ledgerRefs) {
    let result;
    try {
      result = await ledger.lookup(ledgerRef);
    } catch {
      return null;
    }
    const parsed = parseLedgerResult(ledgerRef, result);
    if (!parsed) return null;
    outcomes.push(parsed);
  }
  return Object.freeze(outcomes);
}

function parseExecution(value) {
  if (!isPlainRecord(value)) return null;
  const messages = ownValue(value, 'messages');
  const terminalOutcome = ownValue(value, 'terminalOutcome') ?? 'completed';
  if (!Array.isArray(messages) || messages.length === 0
    || !Object.hasOwn(TERMINAL_OUTCOME_MAP, terminalOutcome)) return null;
  const normalized = [];
  for (const message of messages) {
    if (!isPlainRecord(message)) return null;
    const role = ownValue(message, 'role');
    const content = ownValue(message, 'content');
    if (!['assistant', 'tool_summary'].includes(role)
      || typeof content !== 'string' || content.includes('\0')) return null;
    normalized.push(Object.freeze({ role, content }));
  }
  try {
    assertResponseBodyWithinLimit(JSON.stringify(normalized));
  } catch {
    return null;
  }
  return Object.freeze({ terminalOutcome, messages: Object.freeze(normalized) });
}

function mapRepositoryOutcome(outcome) {
  if (outcome === 'not_found') return Object.freeze({ outcome: 'NOT_FOUND' });
  if (outcome === 'deleting') return Object.freeze({ outcome: 'CONVERSATION_DELETING' });
  if (outcome === 'expired') return Object.freeze({ outcome: 'EXPIRED' });
  if (outcome === 'unavailable') return DEPENDENCY_UNAVAILABLE;
  return null;
}

function publicResult(outcome, details = {}) {
  return Object.freeze({ outcome, ...details });
}

/**
 * Compose canonical turn reservations with the SPEC-002 ledger and an injected
 * turn executor. The fixed DEC-001 gate is the default and runs before every
 * repository, ledger, or executor call. The executor receives only trusted
 * server identifiers, a bounded message, the cancellation signal, and safe
 * ledger outcomes; it must never treat those identifiers as authentication.
 */
export function createTurnCoordinator({
  conversationRepository,
  executionLedger,
  accessGate = memoryAccessGate,
} = {}) {
  assertServerOnlyRuntime();
  const repository = assertConversationRepository(conversationRepository);
  const ledger = assertExecutionLedgerPort(executionLedger);
  if (!accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('MemoryAccessGate must provide a run method.');
  }

  const queue = createConversationQueue();
  const activeTurns = new Map();

  async function coordinate(request, executeTurn, trustedContext) {
    const { ledgerRefs, signal: callerSignal } = trustedContext;
    if (callerSignal?.aborted) return publicResult('CANCELLED');
    const internalAbort = new AbortController();
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, internalAbort.signal])
      : internalAbort.signal;
    const active = Object.freeze({ turnId: request.turnId, abortController: internalAbort });
    activeTurns.set(request.conversationId, active);
    try {
      if (signal.aborted) return publicResult('CANCELLED');
      let reservation;
      try {
        reservation = await repository.reserveTurn({
          conversationId: request.conversationId,
          idempotencyKey: request.idempotencyKey,
          payloadHash: request.payloadHash,
          turnId: request.turnId,
          correlationId: request.correlationId,
        });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }

      if (!isPlainRecord(reservation)) return DEPENDENCY_UNAVAILABLE;
      const reservationOutcome = ownValue(reservation, 'outcome');
      if (reservationOutcome === 'replayed') {
        const messages = ownValue(reservation, 'messages');
        return Array.isArray(messages) ? publicResult('REPLAYED', { messages }) : DEPENDENCY_UNAVAILABLE;
      }
      if (reservationOutcome === 'conflict') return CONFLICT;
      const mappedReservation = mapRepositoryOutcome(reservationOutcome);
      if (mappedReservation) return mappedReservation;
      if (reservationOutcome !== 'reserved') return DEPENDENCY_UNAVAILABLE;

      const priorLedgerOutcomes = await inspectLedger(ledger, ledgerRefs);
      if (priorLedgerOutcomes === null) return LEDGER_UNRESOLVED;

      let execution = null;
      if (!signal.aborted) {
        try {
          execution = await executeTurn(Object.freeze({
            conversationId: request.conversationId,
            turnId: request.turnId,
            correlationId: request.correlationId,
            message: request.message,
            signal,
            priorLedgerOutcomes,
          }));
        } catch {
          execution = null;
        }
      }

      const afterLedgerOutcomes = await inspectLedger(ledger, ledgerRefs);
      if (afterLedgerOutcomes === null) return LEDGER_UNRESOLVED;
      const hasCompletedEffect = afterLedgerOutcomes.some((item) => item.status === 'completed');
      if (hasCompletedEffect && (signal.aborted || execution === null)) return LEDGER_UNRESOLVED;

      const parsedExecution = parseExecution(execution);
      const terminalOutcome = signal.aborted ? 'cancelled' : parsedExecution?.terminalOutcome ?? 'failed';
      let responseMessages = parsedExecution?.messages;
      if (!responseMessages || terminalOutcome === 'cancelled' || terminalOutcome === 'timed-out'
        || terminalOutcome === 'failed') {
        if (hasCompletedEffect) return LEDGER_UNRESOLVED;
        responseMessages = [Object.freeze({
          role: 'assistant',
          content: terminalOutcome === 'cancelled' ? CANCELLATION_MESSAGE : FAILURE_MESSAGE,
        })];
      }

      const canonicalMessages = Object.freeze([
        Object.freeze({ role: 'user', content: request.message }),
        ...responseMessages,
      ]);
      let appended;
      try {
        appended = await repository.appendTurn({
          conversationId: request.conversationId,
          turnId: request.turnId,
          messages: canonicalMessages,
        });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
      if (!isPlainRecord(appended)) return DEPENDENCY_UNAVAILABLE;
      const appendOutcome = ownValue(appended, 'outcome');
      if (appendOutcome === 'appended') {
        return publicResult(TERMINAL_OUTCOME_MAP[terminalOutcome], {
          messages: ownValue(appended, 'messages') ?? canonicalMessages,
        });
      }
      if (appendOutcome === 'replayed') {
        return publicResult('REPLAYED', { messages: ownValue(appended, 'messages') ?? [] });
      }
      if (appendOutcome === 'conflict') return CONFLICT;
      return mapRepositoryOutcome(appendOutcome) ?? DEPENDENCY_UNAVAILABLE;
    } finally {
      if (activeTurns.get(request.conversationId) === active) activeTurns.delete(request.conversationId);
    }
  }

  async function run(requestValue, executeTurn, trustedContextValue) {
    const request = parseRequest(requestValue);
    if (!request || typeof executeTurn !== 'function') return INVALID_REQUEST;
    const trustedContext = parseTrustedContext(trustedContextValue);
    if (!trustedContext) return INVALID_REQUEST;
    return runThroughGate(accessGate, () => queue.run(
      request.conversationId,
      () => coordinate(request, executeTurn, trustedContext),
    ));
  }

  async function cancelConversation(conversationIdValue) {
    let conversationId;
    try {
      conversationId = validateConversationId(conversationIdValue);
    } catch {
      return INVALID_REQUEST;
    }
    return runThroughGate(accessGate, async () => {
      const active = activeTurns.get(conversationId);
      if (!active) return publicResult('NOT_FOUND');
      active.abortController.abort(new Error('Conversation deletion requested.'));
      return publicResult('CANCELLED', { turnId: active.turnId });
    });
  }

  return Object.freeze({ run, cancelConversation });
}
