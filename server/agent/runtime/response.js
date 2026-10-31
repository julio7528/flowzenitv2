import { z } from 'zod';
import { MutationOutcomeSchema } from '../../domain/write/outcomes.js';
import { RUNTIME_LIMITS } from './limits.js';
import { assertServerOnlyRuntime } from './server-only.js';

assertServerOnlyRuntime();

const MAX_JSON_NODES = 8_192;
const MAX_JSON_DEPTH = 48;
const MAX_ACTION_ITEMS = 64;
const RESPONSE_ERROR_MESSAGES = Object.freeze({
  INVALID_RESPONSE: 'Response could not be safely composed.',
  RESPONSE_TOO_LARGE: 'Response exceeds the allowed size.',
});
const POC_WRITE_OPERATION_LABELS = Object.freeze({
  create_task: 'tarefa',
  create_subtask: 'subtarefa',
  create_routine_series: 'rotina',
});
const POC_WRITE_OUTCOME_SCHEMA = MutationOutcomeSchema.extend({
  operation: z.enum(Object.keys(POC_WRITE_OPERATION_LABELS)),
  reasonCategory: MutationOutcomeSchema.shape.reasonCategory.optional(),
});

export class AgentResponseError extends Error {
  constructor(code = 'INVALID_RESPONSE') {
    const safeCode = Object.hasOwn(RESPONSE_ERROR_MESSAGES, code)
      ? code
      : 'INVALID_RESPONSE';
    super(RESPONSE_ERROR_MESSAGES[safeCode]);
    this.name = 'AgentResponseError';
    this.code = safeCode;
  }
}

function invalidResponse() {
  throw new AgentResponseError('INVALID_RESPONSE');
}

function responseTooLarge() {
  throw new AgentResponseError('RESPONSE_TOO_LARGE');
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function readInput(input) {
  if (!isPlainRecord(input)) invalidResponse();

  try {
    if (Object.getOwnPropertySymbols(input).length > 0) invalidResponse();

    const allowed = new Set(['text', 'toolResults', 'missingEvidence', 'uncompletedActions', 'writeOutcome']);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of Object.getOwnPropertyNames(input)) {
      const descriptor = descriptors[key];
      if (!allowed.has(key)
        || !descriptor
        || !Object.hasOwn(descriptor, 'value')
        || !descriptor.enumerable) {
        invalidResponse();
      }
    }

    const read = (key, fallback) => {
      const descriptor = descriptors[key];
      if (!descriptor) return fallback;
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) invalidResponse();
      return descriptor.value;
    };

    return {
      text: read('text', ''),
      toolResults: read('toolResults', []),
      missingEvidence: read('missingEvidence', []),
      uncompletedActions: read('uncompletedActions', []),
      writeOutcome: read('writeOutcome', null),
    };
  } catch (error) {
    if (error instanceof AgentResponseError) throw error;
    invalidResponse();
  }
}

function cloneJsonValue(value, context, depth = 0) {
  context.nodeCount += 1;
  if (context.nodeCount > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) invalidResponse();

  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > RUNTIME_LIMITS.maxResponseBytes) responseTooLarge();
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalidResponse();
    return value;
  }
  if (typeof value !== 'object') invalidResponse();

  if (context.active.has(value)) invalidResponse();
  context.active.add(value);

  try {
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Object.getOwnPropertySymbols(value).length > 0) invalidResponse();

      for (const key of Object.getOwnPropertyNames(value)) {
        if (key === 'length') continue;
        const index = Number(key);
        if (!Number.isSafeInteger(index)
          || index < 0
          || index >= value.length
          || String(index) !== key) {
          invalidResponse();
        }
      }

      const clone = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
          invalidResponse();
        }
        clone[index] = cloneJsonValue(descriptor.value, context, depth + 1);
      }
      return clone;
    }

    if (!isPlainRecord(value)) invalidResponse();

    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) invalidResponse();

    const clone = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        invalidResponse();
      }
      if (Buffer.byteLength(key, 'utf8') > RUNTIME_LIMITS.maxResponseBytes) responseTooLarge();

      Object.defineProperty(clone, key, {
        value: cloneJsonValue(descriptor.value, context, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return clone;
  } catch (error) {
    if (error instanceof AgentResponseError) throw error;
    invalidResponse();
  } finally {
    context.active.delete(value);
  }
}

function cloneJsonArray(value, { maxItems, context }) {
  if (!Array.isArray(value) || value.length > maxItems) invalidResponse();
  return cloneJsonValue(value, context);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Compose the approved answer shape without interpreting or selecting tool
 * candidates. Structured SPEC-004 results are JSON-copied intact so cursor,
 * provenance, narrowing, unsupported-entity, and truncation semantics survive.
 */
export function composeAgentResponse(input = {}) {
  const values = readInput(input);
  if (typeof values.text !== 'string') invalidResponse();

  const context = { active: new WeakSet(), nodeCount: 0 };
  let writeOutcome = null;
  if (values.writeOutcome !== null) {
    const safeCandidate = cloneJsonValue(values.writeOutcome, context);
    const parsed = POC_WRITE_OUTCOME_SCHEMA.safeParse(safeCandidate);
    if (!parsed.success) invalidResponse();
    writeOutcome = parsed.data;
  }
  const confirmedWrite = writeOutcome?.outcome === 'COMMITTED'
    && typeof writeOutcome.persistentId === 'string';
  const responseText = writeOutcome === null
    ? values.text
    : confirmedWrite
      ? `Cadastro confirmado: ${POC_WRITE_OPERATION_LABELS[writeOutcome.operation]} (ID ${writeOutcome.persistentId}).`
      : ['DEPENDENCY_UNAVAILABLE', 'FAILED', 'CONFLICT', 'IDEMPOTENCY_CONFLICT']
        .includes(writeOutcome.outcome)
        ? 'Não consegui confirmar se o cadastro foi gravado. Verifique o registro antes de tentar novamente.'
        : writeOutcome.outcome === 'VALIDATION_ERROR'
          ? 'Não consegui concluir o cadastro com esses dados. Preciso de mais informações.'
          : writeOutcome.outcome === 'NO_OP'
            ? 'Nenhum cadastro novo foi confirmado.'
            : 'O cadastro não foi confirmado.';
  const text = cloneJsonValue(responseText, context);
  const evidence = cloneJsonArray(values.toolResults, {
    maxItems: RUNTIME_LIMITS.maxToolCalls,
    context,
  });
  const missingEvidence = cloneJsonArray(values.missingEvidence, {
    maxItems: MAX_ACTION_ITEMS,
    context,
  });
  const uncompletedActions = cloneJsonArray(values.uncompletedActions, {
    maxItems: MAX_ACTION_ITEMS,
    context,
  });

  const answer = {
    text,
    evidence,
    // Model-generated prose is inference. Evidence remains separately tied to
    // structured tool results and their persistent source references.
    inference: writeOutcome === null && text.length > 0 ? [text] : [],
    missingEvidence,
    uncompletedActions,
  };

  let serialized;
  try {
    serialized = JSON.stringify(answer);
  } catch {
    invalidResponse();
  }
  if (Buffer.byteLength(serialized, 'utf8') > RUNTIME_LIMITS.maxResponseBytes) {
    responseTooLarge();
  }

  return deepFreeze(answer);
}
