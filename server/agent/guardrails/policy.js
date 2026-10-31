import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { RUNTIME_LIMITS } from '../runtime/limits.js';
import { canonicalizePayload, canonicalizeTarget, fingerprintPreconditions } from './canonical-action.js';
import { validateInputDto } from './input-validation.js';
import { validateMutationCommand } from '../../domain/write/contracts.js';
import { CreateRoutineSeriesInputSchema } from '../../domain/recurrence/contracts.js';
import { POC_CREATE_OPERATION_NAMES } from './intent.js';
import { AGENT_READ_TOOL_NAMES } from '../tools/registry.js';
import {
  assertExecutionLedgerPort,
  LedgerAcknowledgementSchema,
  LedgerReservationSchema,
  SafeOutcomeReferenceSchema,
} from '../persistence/ports.js';

assertServerOnlyRuntime();

export const POLICY_OUTCOMES = Object.freeze(['ALLOW', 'DENY', 'REQUIRE_CONFIRMATION', 'REQUIRE_CLARIFICATION']);
export const POLICY_REASON_CATEGORIES = Object.freeze([
  'INVALID_INPUT',
  'CAPABILITY_DISABLED',
  'POLICY_DENIED',
  'POLICY_ALLOWED',
  'POLICY_UNAVAILABLE',
  'CONFIRMATION_REQUIRED',
  'CONFIRMATION_INVALID',
  'STALE_PRECONDITION',
  'IDEMPOTENCY_CONFLICT',
  'BUDGET_EXHAUSTED',
  'DEPENDENCY_UNAVAILABLE',
]);

const DEC001_CLOSED_ACCESS_GATE = Object.freeze({
  async allowsAction() {
    return false;
  },
});
const JsonTargetSchema = z.unknown();

export const POC_ACTION_POLICY_VERSION = 'poc-action-policy@1';

const POC_READ_ACTION_NAMES = new Set(AGENT_READ_TOOL_NAMES);
const POC_CREATE_ACTION_NAMES = new Set(POC_CREATE_OPERATION_NAMES);
const POC_CONTEXTS = new WeakMap();

function readPocPlainRecord(value, allowedKeys = null) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Object.keys(descriptors);
    if (Object.values(descriptors).some(item => !Object.hasOwn(item, 'value') || !item.enumerable)) return null;
    if (allowedKeys && names.some(name => !allowedKeys.includes(name))) return null;
    return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
  } catch {
    return null;
  }
}

function pocDecision(outcome, reasonCategory) {
  return Object.freeze({
    outcome,
    reasonCategory,
    policyVersion: POC_ACTION_POLICY_VERSION,
    correlationId: randomUUID(),
  });
}

/**
 * Mint a one-turn authority object from server-validated message provenance.
 * User text remains untrusted content; only this server-owned provenance and
 * direct-intent classification can authorize a create proposal.
 */
export function createPocTurnContext(value) {
  const input = readPocPlainRecord(value, [
    'sourceKind', 'directUserIntent', 'directCreateOperations', 'routineClarificationRequired',
  ]);
  if (!input
    || !Object.hasOwn(input, 'sourceKind')
    || !Object.hasOwn(input, 'directUserIntent')
    || !['user', 'assistant', 'model', 'retrieved'].includes(input.sourceKind)
    || typeof input.directUserIntent !== 'boolean') {
    throw new TypeError('A validated POC turn context is required.');
  }
  const directCreateOperations = input.directCreateOperations
    ?? (input.directUserIntent ? [...POC_CREATE_OPERATION_NAMES] : []);
  const routineClarificationRequired = input.routineClarificationRequired ?? false;
  if (!Array.isArray(directCreateOperations)
    || directCreateOperations.some(name => !POC_CREATE_ACTION_NAMES.has(name))
    || new Set(directCreateOperations).size !== directCreateOperations.length
    || typeof routineClarificationRequired !== 'boolean'
    || (routineClarificationRequired && !directCreateOperations.includes('create_routine_series'))) {
    throw new TypeError('A validated POC turn context is required.');
  }
  const context = Object.freeze({
    sourceKind: input.sourceKind,
    directUserIntent: input.directUserIntent,
    directCreateOperations: Object.freeze([...directCreateOperations]),
    routineClarificationRequired,
  });
  POC_CONTEXTS.set(context, {
    createUsed: false,
    directCreateOperations: context.directCreateOperations,
    routineClarificationRequired,
  });
  return context;
}

function clarification() {
  return pocDecision('REQUIRE_CLARIFICATION', 'INVALID_INPUT');
}

/**
 * Evaluate the narrow POC action allowlist. This only returns a decision; the
 * registered typed tool remains responsible for its own schema and persistence.
 */
export function evaluatePocAction(candidate, turnContext = null) {
  const action = readPocPlainRecord(candidate, ['operationName', 'operationVersion', 'arguments']);
  if (!action || Object.keys(action).length !== 3
    || typeof action.operationName !== 'string'
    || action.operationVersion !== '1.0.0') {
    return pocDecision('DENY', 'INVALID_INPUT');
  }
  const args = readPocPlainRecord(action.arguments);
  if (!args) return pocDecision('DENY', 'INVALID_INPUT');

  if (POC_READ_ACTION_NAMES.has(action.operationName)) {
    return pocDecision('ALLOW', 'POLICY_ALLOWED');
  }
  if (!POC_CREATE_ACTION_NAMES.has(action.operationName)) {
    return pocDecision('DENY', 'CAPABILITY_DISABLED');
  }

  let validCreate = false;
  if (action.operationName === 'create_task' || action.operationName === 'create_subtask') {
    const input = readPocPlainRecord(args, ['name', 'parentId']);
    if (input && Object.keys(input).length === 2) {
      const command = validateMutationCommand({
        operation: action.operationName,
        version: 1,
        parentId: input.parentId,
        payload: { name: input.name },
      });
      validCreate = command.valid;
    }
  } else {
    validCreate = CreateRoutineSeriesInputSchema.safeParse(args).success;
  }
  if (!validCreate) return clarification();

  const usage = turnContext && typeof turnContext === 'object' ? POC_CONTEXTS.get(turnContext) : null;
  if (action.operationName === 'create_routine_series' && usage?.routineClarificationRequired) {
    return clarification();
  }
  if (!usage || turnContext.sourceKind !== 'user' || turnContext.directUserIntent !== true) {
    return pocDecision('DENY', 'POLICY_DENIED');
  }
  if (!usage.directCreateOperations.includes(action.operationName)) {
    return pocDecision('DENY', 'POLICY_DENIED');
  }
  if (usage.createUsed) return pocDecision('DENY', 'POLICY_DENIED');

  // Consume synchronously before the caller invokes a write tool. This also
  // closes races between multiple model-proposed creates in one turn.
  usage.createUsed = true;
  return pocDecision('ALLOW', 'POLICY_ALLOWED');
}

export const productionPocActionPolicy = Object.freeze({ evaluate: evaluatePocAction });

function deny(reasonCategory, correlationId = randomUUID(), policyVersion = 'unavailable') {
  return Object.freeze({ outcome: 'DENY', reasonCategory, policyVersion, correlationId });
}

function readBudget(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = ['graphStepsUsed', 'modelCallsUsed', 'toolCallsUsed'];
    const result = Object.create(null);
    for (const name of names) {
      const descriptor = descriptors[name];
      if (!descriptor || !Object.hasOwn(descriptor, 'value')
        || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0) return null;
      result[name] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function readActionIntent(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
      result[key] = descriptor.value;
    }
    if (typeof result.operationName !== 'string' || result.operationName.length === 0
      || typeof result.operationVersion !== 'string' || result.operationVersion.length === 0) return null;
    return Object.freeze(result);
  } catch {
    return null;
  }
}

function readMatrixEntry(matrix, operationKey) {
  if (matrix === null || typeof matrix !== 'object' || Array.isArray(matrix)) return null;
  try {
    const prototype = Object.getPrototypeOf(matrix);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const top = Object.getOwnPropertyDescriptors(matrix);
    const versionDescriptor = top.version;
    const statusDescriptor = top.status;
    const entriesDescriptor = top.entries;
    if (!versionDescriptor || !Object.hasOwn(versionDescriptor, 'value')
      || typeof versionDescriptor.value !== 'string' || versionDescriptor.value.length === 0
      || !statusDescriptor || !Object.hasOwn(statusDescriptor, 'value') || statusDescriptor.value !== 'approved'
      || !entriesDescriptor || !Object.hasOwn(entriesDescriptor, 'value')) return null;
    const entries = entriesDescriptor.value;
    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) return null;
    const entriesPrototype = Object.getPrototypeOf(entries);
    if (entriesPrototype !== Object.prototype && entriesPrototype !== null) return null;
    const descriptor = Object.getOwnPropertyDescriptor(entries, operationKey);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return { version: versionDescriptor.value, entry: null };
    const entry = descriptor.value;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const entryDescriptors = Object.getOwnPropertyDescriptors(entry);
    if (Object.getOwnPropertySymbols(entry).length > 0
      || Object.values(entryDescriptors).some(item => !Object.hasOwn(item, 'value'))) return null;
    if (!['ALLOW', 'DENY'].includes(entry.outcome) || typeof entry.confirmationRequired !== 'boolean') return null;
    return { version: versionDescriptor.value, entry };
  } catch {
    return null;
  }
}

function copyCapabilityRegistry(candidate) {
  if (!(candidate instanceof Map)) throw new TypeError('A server capability registry is required.');
  const copied = new Map();
  for (const [key, definition] of candidate) {
    if (typeof key !== 'string' || definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new TypeError('A capability registry entry is invalid.');
    }
    const prototype = Object.getPrototypeOf(definition);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(definition).length > 0) {
      throw new TypeError('A capability registry entry must be a plain record.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(definition);
    if (Object.values(descriptors).some(item => !Object.hasOwn(item, 'value'))) {
      throw new TypeError('Capability registry entries cannot contain accessors.');
    }
    const {
      operationName,
      operationVersion,
      capability,
      enabled,
      inputSchema,
      isTargetInScope,
      readPreconditions,
      handler,
    } = definition;
    if (key !== `${operationName}@${operationVersion}`
      || typeof operationName !== 'string' || operationName.length === 0
      || typeof operationVersion !== 'string' || operationVersion.length === 0
      || typeof capability !== 'string' || capability.length === 0
      || typeof enabled !== 'boolean'
      || !inputSchema || typeof inputSchema.safeParse !== 'function'
      || typeof isTargetInScope !== 'function'
      || typeof readPreconditions !== 'function'
      || typeof handler !== 'function') {
      throw new TypeError('Capability registry entry is incomplete.');
    }
    copied.set(key, Object.freeze({
      operationName,
      operationVersion,
      capability,
      enabled,
      inputSchema,
      isTargetInScope,
      readPreconditions,
      handler,
    }));
  }
  return copied;
}

function readPreconditionSnapshot(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some(item => !Object.hasOwn(item, 'value'))) return null;
    return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  } catch {
    return null;
  }
}

/**
 * Build a server-side policy evaluator. Dependencies are captured at trusted
 * composition time; action requests cannot supply or replace the DEC-001 gate,
 * capability registry, budget source, or approved matrix.
 */
export function createPolicyEvaluator({
  accessGate = DEC001_CLOSED_ACCESS_GATE,
  matrixProvider = () => null,
  budgetProvider = () => null,
  capabilityRegistry = new Map(),
  executionLedger = null,
  idempotencyKeyProvider = null,
} = {}) {
  if (!accessGate || typeof accessGate.allowsAction !== 'function'
    || typeof matrixProvider !== 'function' || typeof budgetProvider !== 'function'
    || (idempotencyKeyProvider !== null && typeof idempotencyKeyProvider !== 'function')) {
    throw new TypeError('Server policy dependencies are required.');
  }
  const capabilities = copyCapabilityRegistry(capabilityRegistry);
  const ledger = executionLedger === null ? null : assertExecutionLedgerPort(executionLedger);

  async function evaluateInternal(actionCandidate) {
    const correlationId = randomUUID();
    const actionIntent = readActionIntent(actionCandidate);
    if (!actionIntent) return { decision: deny('INVALID_INPUT', correlationId) };

    const operationKey = `${actionIntent.operationName}@${actionIntent.operationVersion}`;
    const capability = capabilities.get(operationKey);
    if (!capability || !capability.enabled) return { decision: deny('CAPABILITY_DISABLED', correlationId) };
    if (!Object.hasOwn(actionIntent, 'target') || !Object.hasOwn(actionIntent, 'arguments')) {
      return { decision: deny('INVALID_INPUT', correlationId) };
    }

    const targetResult = validateInputDto({ schema: JsonTargetSchema, candidate: actionIntent.target });
    if (!targetResult.success) return { decision: deny('INVALID_INPUT', correlationId) };
    let canonicalTarget;
    try {
      canonicalTarget = canonicalizeTarget(targetResult.value);
    } catch {
      return { decision: deny('INVALID_INPUT', correlationId) };
    }
    const inputResult = validateInputDto({ schema: capability.inputSchema, candidate: actionIntent.arguments });
    if (!inputResult.success) {
      const reason = inputResult.reason === 'policy_unavailable' ? 'DEPENDENCY_UNAVAILABLE' : 'INVALID_INPUT';
      return { decision: deny(reason, correlationId) };
    }

    // This gate is independent of the action matrix and is evaluated before
    // any operation-specific precondition reader or handler can run.
    let gateSatisfied = false;
    try {
      gateSatisfied = await accessGate.allowsAction(Object.freeze({
        operationName: capability.operationName,
        operationVersion: capability.operationVersion,
        capability: capability.capability,
        canonicalTarget,
      }));
    } catch {
      return { decision: deny('DEPENDENCY_UNAVAILABLE', correlationId) };
    }
    if (gateSatisfied !== true) return { decision: deny('CAPABILITY_DISABLED', correlationId) };

    let inScope = false;
    try {
      inScope = capability.isTargetInScope(canonicalTarget, inputResult.value) === true;
    } catch {
      return { decision: deny('DEPENDENCY_UNAVAILABLE', correlationId) };
    }
    if (!inScope) return { decision: deny('POLICY_DENIED', correlationId) };

    let matrix;
    try {
      matrix = await matrixProvider();
    } catch {
      return { decision: deny('POLICY_UNAVAILABLE', correlationId) };
    }
    const matrixResult = readMatrixEntry(matrix, operationKey);
    if (!matrixResult) return { decision: deny('POLICY_UNAVAILABLE', correlationId) };
    if (!matrixResult.entry) return { decision: deny('POLICY_DENIED', correlationId, matrixResult.version) };
    if (matrixResult.entry.outcome === 'DENY') {
      return { decision: deny('POLICY_DENIED', correlationId, matrixResult.version) };
    }

    let budget;
    try {
      budget = readBudget(await budgetProvider(Object.freeze({
        operationName: capability.operationName,
        operationVersion: capability.operationVersion,
      })));
    } catch {
      return { decision: deny('DEPENDENCY_UNAVAILABLE', correlationId, matrixResult.version) };
    }
    if (!budget) return { decision: deny('DEPENDENCY_UNAVAILABLE', correlationId, matrixResult.version) };
    if (budget.graphStepsUsed >= RUNTIME_LIMITS.maxGraphSteps
      || budget.modelCallsUsed >= RUNTIME_LIMITS.maxModelCalls
      || budget.toolCallsUsed >= RUNTIME_LIMITS.maxToolCalls) {
      return { decision: deny('BUDGET_EXHAUSTED', correlationId, matrixResult.version) };
    }

    let preconditionResult;
    try {
      preconditionResult = readPreconditionSnapshot(await capability.readPreconditions(Object.freeze({
        canonicalTarget,
        validatedInput: inputResult.value,
      })));
    } catch {
      return { decision: deny('DEPENDENCY_UNAVAILABLE', correlationId, matrixResult.version) };
    }
    if (!preconditionResult || preconditionResult.available !== true) {
      return { decision: deny('DEPENDENCY_UNAVAILABLE', correlationId, matrixResult.version) };
    }
    if (preconditionResult.valid !== true || !Object.hasOwn(preconditionResult, 'snapshot')) {
      return { decision: deny('STALE_PRECONDITION', correlationId, matrixResult.version) };
    }

    let preconditionFingerprint;
    let payloadHash;
    try {
      preconditionFingerprint = fingerprintPreconditions(preconditionResult.snapshot);
      payloadHash = canonicalizePayload(inputResult.value).sha256;
    } catch {
      return { decision: deny('DEPENDENCY_UNAVAILABLE', correlationId, matrixResult.version) };
    }

    const base = {
      capability,
      actionIntent,
      operationKey,
      validatedInput: inputResult.value,
      canonicalTarget,
      payloadHash,
      preconditionFingerprint,
    };
    if (matrixResult.entry.confirmationRequired) {
      return {
        ...base,
        decision: Object.freeze({
          outcome: 'REQUIRE_CONFIRMATION',
          reasonCategory: 'CONFIRMATION_REQUIRED',
          policyVersion: matrixResult.version,
          correlationId,
        }),
      };
    }
    return {
      ...base,
      decision: Object.freeze({
        outcome: 'ALLOW',
        reasonCategory: 'POLICY_ALLOWED',
        policyVersion: matrixResult.version,
        correlationId,
      }),
    };
  }

  async function evaluate(actionCandidate) {
    return (await evaluateInternal(actionCandidate)).decision;
  }

  async function execute(actionCandidate) {
    const prepared = await evaluateInternal(actionCandidate);
    if (prepared.decision.outcome !== 'ALLOW') {
      return Object.freeze({ decision: prepared.decision, status: 'denied' });
    }

    // Repeat every authority-bearing check and invoke without another await.
    const immediate = await evaluateInternal(actionCandidate);
    if (immediate.decision.outcome !== 'ALLOW') {
      return Object.freeze({ decision: immediate.decision, status: 'denied' });
    }
    const unchanged = prepared.operationKey === immediate.operationKey
      && prepared.canonicalTarget === immediate.canonicalTarget
      && prepared.payloadHash === immediate.payloadHash
      && prepared.preconditionFingerprint === immediate.preconditionFingerprint
      && prepared.decision.policyVersion === immediate.decision.policyVersion;
    if (!unchanged) {
      return Object.freeze({
        decision: deny('STALE_PRECONDITION', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }

    if (!ledger || !idempotencyKeyProvider) {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }

    const actionHash = canonicalizePayload({
      operationKey: immediate.operationKey,
      canonicalTarget: immediate.canonicalTarget,
      payloadHash: immediate.payloadHash,
      preconditionFingerprint: immediate.preconditionFingerprint,
      policyVersion: immediate.decision.policyVersion,
    }).sha256;
    let idempotencyKey;
    try { idempotencyKey = await idempotencyKeyProvider(Object.freeze({ actionHash })); }
    catch {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }
    if (!z.uuid().safeParse(idempotencyKey).success) {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }

    let reservationValue;
    try { reservationValue = await ledger.reserve(idempotencyKey, actionHash); }
    catch {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }
    if (reservationValue?.status === 'conflict') {
      return Object.freeze({
        decision: deny('IDEMPOTENCY_CONFLICT', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }
    const reservation = LedgerReservationSchema.safeParse(reservationValue);
    if (!reservation.success) {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }
    if (reservation.data.status === 'prior-outcome') {
      return Object.freeze({
        decision: immediate.decision,
        status: 'replayed',
        safeOutcomeReference: SafeOutcomeReferenceSchema.parse(reservation.data.safeOutcomeReference),
      });
    }

    let started;
    try { started = await ledger.recordStarted(idempotencyKey); }
    catch {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }
    if (started !== true && !LedgerAcknowledgementSchema.safeParse(started).success) {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'denied',
      });
    }

    let handlerResult;
    let safeOutcomeReference;
    try {
      handlerResult = await immediate.capability.handler(immediate.validatedInput, Object.freeze({
        target: JSON.parse(immediate.canonicalTarget),
        operationName: immediate.capability.operationName,
        operationVersion: immediate.capability.operationVersion,
        policyVersion: immediate.decision.policyVersion,
        preconditionFingerprint: immediate.preconditionFingerprint,
        correlationId: immediate.decision.correlationId,
      }));
      safeOutcomeReference = `sha256:${canonicalizePayload({ outcome: 'completed', result: handlerResult }).sha256}`;
    } catch {
      safeOutcomeReference = `uncertain:${actionHash}`;
    }
    try {
      safeOutcomeReference = SafeOutcomeReferenceSchema.parse(safeOutcomeReference);
      const recorded = await ledger.recordOutcome(idempotencyKey, safeOutcomeReference);
      if (recorded !== true && !LedgerAcknowledgementSchema.safeParse(recorded).success) {
        return Object.freeze({
          decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
          status: 'failed',
        });
      }
    } catch {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'failed',
      });
    }
    if (safeOutcomeReference.startsWith('uncertain:')) {
      return Object.freeze({
        decision: deny('DEPENDENCY_UNAVAILABLE', immediate.decision.correlationId, immediate.decision.policyVersion),
        status: 'failed',
        safeOutcomeReference,
      });
    }
    return Object.freeze({ decision: immediate.decision, status: 'executed', handlerResult, safeOutcomeReference });
  }

  return Object.freeze({ evaluate, execute });
}

export const productionPolicyEvaluator = createPolicyEvaluator();

export async function evaluatePolicy(actionIntent) {
  return productionPolicyEvaluator.evaluate(actionIntent);
}
