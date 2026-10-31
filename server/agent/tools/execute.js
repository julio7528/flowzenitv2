import { ToolProposalSchema, TrustedTurnContextSchema } from '../runtime/state.js';
import { RUNTIME_LIMITS } from '../runtime/limits.js';
import { productionCapabilityPolicy } from '../runtime/capabilities.js';
import {
  AGENT_TOOL_NAMES,
  SPEC006_WRITE_TOOL_NAMES,
  SPEC007_RECURRENCE_TOOL_NAMES,
} from '../runtime/state.js';
import { productionPocActionPolicy } from '../guardrails/policy.js';
import { runSyntheticEffectWithLedger } from '../persistence/ports.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

const DENIED = Object.freeze({
  invalid_proposal: Object.freeze({ status: 'denied', reason: 'invalid_proposal' }),
  unknown_tool: Object.freeze({ status: 'denied', reason: 'unknown_tool' }),
  capability_disabled: Object.freeze({ status: 'denied', reason: 'capability_disabled' }),
  budget_exhausted: Object.freeze({ status: 'denied', reason: 'budget_exhausted' }),
  cancelled: Object.freeze({ status: 'denied', reason: 'cancelled' }),
  timed_out: Object.freeze({ status: 'denied', reason: 'timed_out' }),
  dependency_failure: Object.freeze({ status: 'failed', reason: 'dependency_failure' }),
});

const TOOL_NAMES = new Set(AGENT_TOOL_NAMES);
const POC_CREATE_TOOL_NAMES = new Set([
  ...SPEC006_WRITE_TOOL_NAMES,
  ...SPEC007_RECURRENCE_TOOL_NAMES,
]);
const PREINVOKE_CANCELLED = Symbol('pre-invocation-cancelled');
const PREINVOKE_TIMEOUT = Symbol('pre-invocation-timeout');

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isAbortSignal(signal) {
  return signal === undefined || (
    signal !== null
    && typeof signal === 'object'
    && typeof signal.aborted === 'boolean'
    && typeof signal.addEventListener === 'function'
    && typeof signal.removeEventListener === 'function'
  );
}

function getBudgetValues(budget) {
  if (!isPlainRecord(budget)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(budget);
    const toolCallsUsedDescriptor = descriptors.toolCallsUsed;
    const deadlineAtDescriptor = descriptors.deadlineAt;
    if (!toolCallsUsedDescriptor || !Object.hasOwn(toolCallsUsedDescriptor, 'value')
      || !deadlineAtDescriptor || !Object.hasOwn(deadlineAtDescriptor, 'value')) {
      return null;
    }

    const { toolCallsUsed, deadlineAt } = {
      toolCallsUsed: toolCallsUsedDescriptor.value,
      deadlineAt: deadlineAtDescriptor.value,
    };
    if (!Number.isSafeInteger(toolCallsUsed) || toolCallsUsed < 0
      || !Number.isFinite(deadlineAt)) {
      return null;
    }

    return { toolCallsUsed, deadlineAt };
  } catch {
    return null;
  }
}

function readRegistryEntry(registry, toolName) {
  if (!(registry instanceof Map) || !TOOL_NAMES.has(toolName)) return null;
  try {
    const entry = registry.get(toolName);
    if (!isPlainRecord(entry)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    const valueFor = (key) => {
      const descriptor = descriptors[key];
      return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    };
    const name = valueFor('name');
    const version = valueFor('version');
    const inputSchema = valueFor('inputSchema');
    const handler = valueFor('handler');
    if (name !== toolName || typeof version !== 'string' || version.length === 0
      || typeof inputSchema?.safeParse !== 'function' || typeof handler !== 'function') {
      return null;
    }
    return { original: entry, name, version, inputSchema, handler };
  } catch {
    return null;
  }
}

function parseProposal(value) {
  try {
    const result = ToolProposalSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function parseArguments(schema, value) {
  try {
    const result = schema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function readCapabilityDecision(value, toolName) {
  if (!isPlainRecord(value)) return false;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const access = descriptors.accessDecision;
    const disclosure = descriptors.disclosureDecision;
    const allowedNames = descriptors.allowedToolNames;
    if (!access || !Object.hasOwn(access, 'value')
      || !disclosure || !Object.hasOwn(disclosure, 'value')
      || !allowedNames || !Object.hasOwn(allowedNames, 'value')) {
      return false;
    }
    const names = allowedNames.value;
    return access.value === 'allow'
      && disclosure.value === 'allow'
      && Array.isArray(names)
      && names.includes(toolName);
  } catch {
    return false;
  }
}

function readClock(clock) {
  try {
    const value = clock.now();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function effectiveDeadline(deadlineAt, now) {
  // Clamp internal input to the approved turn deadline even if a caller passes
  // a larger value. The turn's start time is not user controlled.
  return Math.min(deadlineAt, now + RUNTIME_LIMITS.deadlineMs);
}

async function evaluateCapability(capabilityPolicy, context, proposal) {
  try {
    const decision = await capabilityPolicy(context, proposal);
    return readCapabilityDecision(decision, proposal.toolName);
  } catch {
    return false;
  }
}

function makeTimeoutSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timer;
  let onParentAbort;
  let timeoutReached = false;
  let parentCancelled = false;

  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      timeoutReached = true;
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });

  const cancellationPromise = new Promise((resolve) => {
    if (!parentSignal) return;
    onParentAbort = () => {
      parentCancelled = true;
      controller.abort(parentSignal.reason);
      resolve('cancelled');
    };
    if (parentSignal.aborted) {
      onParentAbort();
      return;
    }
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  });

  return {
    signal: controller.signal,
    timeoutPromise,
    cancellationPromise,
    wasTimedOut: () => timeoutReached,
    wasCancelled: () => parentCancelled,
    cleanup() {
      clearTimeout(timer);
      if (parentSignal && onParentAbort) {
        parentSignal.removeEventListener('abort', onParentAbort);
      }
    },
  };
}

/**
 * Create the fixed read-only proposal executor. Production uses the closed
 * capability policy by default. Test capabilities can only be injected into
 * this server-side constructor; no request or model field selects one.
 */
export function createToolExecutor({
  registry,
  capabilityPolicy = productionCapabilityPolicy,
  actionPolicy = productionPocActionPolicy,
  clock = Date,
} = {}) {
  if (!(registry instanceof Map) || typeof capabilityPolicy !== 'function'
    || !actionPolicy || typeof actionPolicy.evaluate !== 'function'
    || !clock || typeof clock.now !== 'function') {
    throw new TypeError('A server-side tool registry, policy, action policy, and clock are required.');
  }

  async function execute({ proposal: rawProposal, context: rawContext, actionContext, budget, signal } = {}) {
    if (!isAbortSignal(signal)) return DENIED.invalid_proposal;
    if (signal?.aborted) return DENIED.cancelled;

    let context;
    try {
      context = TrustedTurnContextSchema.parse(rawContext);
    } catch {
      return DENIED.invalid_proposal;
    }

    const proposal = parseProposal(rawProposal);
    if (!proposal || proposal.policyDecision !== 'not-evaluated') return DENIED.invalid_proposal;

    let entry = readRegistryEntry(registry, proposal.toolName);
    if (!entry) return DENIED.unknown_tool;
    if (entry.version !== proposal.toolVersion) return DENIED.invalid_proposal;

    let input = parseArguments(entry.inputSchema, proposal.arguments);
    if (input === null) return DENIED.invalid_proposal;

    const values = getBudgetValues(budget);
    const now = readClock(clock);
    if (!values || now === null) return DENIED.invalid_proposal;
    if (values.toolCallsUsed >= RUNTIME_LIMITS.maxToolCalls) return DENIED.budget_exhausted;

    const deadlineAt = effectiveDeadline(values.deadlineAt, now);
    if (now >= deadlineAt) return DENIED.timed_out;
    if (signal?.aborted) return DENIED.cancelled;

    if (!await evaluateCapability(capabilityPolicy, context, proposal)) {
      return DENIED.capability_disabled;
    }

    // Re-read every authority-bearing component directly before the handler.
    // This catches policy changes, registry replacement, and exhausted budgets.
    if (signal?.aborted) return DENIED.cancelled;
    const beforeHandlerNow = readClock(clock);
    if (beforeHandlerNow === null || beforeHandlerNow >= deadlineAt) return DENIED.timed_out;
    const currentValues = getBudgetValues(budget);
    if (!currentValues || currentValues.toolCallsUsed >= RUNTIME_LIMITS.maxToolCalls) {
      return DENIED.budget_exhausted;
    }

    const currentEntry = readRegistryEntry(registry, proposal.toolName);
    if (!currentEntry || currentEntry.original !== entry.original
      || currentEntry.version !== proposal.toolVersion) {
      return DENIED.unknown_tool;
    }
    entry = currentEntry;
    input = parseArguments(entry.inputSchema, proposal.arguments);
    if (input === null) return DENIED.invalid_proposal;

    if (!await evaluateCapability(capabilityPolicy, context, proposal)) {
      return DENIED.capability_disabled;
    }

    if (POC_CREATE_TOOL_NAMES.has(proposal.toolName)) {
      let actionDecision;
      try {
        actionDecision = await actionPolicy.evaluate({
          operationName: proposal.toolName,
          operationVersion: entry.version,
          arguments: input,
        }, actionContext);
      } catch {
        return DENIED.capability_disabled;
      }
      if (actionDecision?.outcome !== 'ALLOW') {
        return actionDecision?.outcome === 'REQUIRE_CLARIFICATION'
          ? DENIED.invalid_proposal
          : DENIED.capability_disabled;
      }
    }
    if (signal?.aborted) return DENIED.cancelled;
    const invocationNow = readClock(clock);
    if (invocationNow === null || invocationNow >= deadlineAt) return DENIED.timed_out;
    if (getBudgetValues(budget)?.toolCallsUsed >= RUNTIME_LIMITS.maxToolCalls) {
      return DENIED.budget_exhausted;
    }

    const remainingDeadlineMs = Math.max(0, deadlineAt - invocationNow);
    if (remainingDeadlineMs <= 0) return DENIED.timed_out;
    const timeoutMs = Math.min(RUNTIME_LIMITS.toolTimeoutMs, remainingDeadlineMs);
    const boundedSignal = makeTimeoutSignal(signal, timeoutMs);
    if (boundedSignal.wasCancelled()) {
      boundedSignal.cleanup();
      return DENIED.cancelled;
    }

    try {
      const resultPromise = Promise.resolve()
        .then(() => {
          if (boundedSignal.signal.aborted) {
            return boundedSignal.wasCancelled() ? PREINVOKE_CANCELLED : PREINVOKE_TIMEOUT;
          }
          return entry.handler(input, { signal: boundedSignal.signal });
        })
        .then((result) => {
          if (result === PREINVOKE_CANCELLED) return { kind: 'cancelled' };
          if (result === PREINVOKE_TIMEOUT) return { kind: 'timeout' };
          return { kind: 'result', result };
        }, () => ({ kind: 'error' }));
      const outcome = await Promise.race([
        resultPromise,
        boundedSignal.timeoutPromise.then(() => ({ kind: 'timeout' })),
        boundedSignal.cancellationPromise.then(() => ({ kind: 'cancelled' })),
      ]);

      if (boundedSignal.wasCancelled() || outcome.kind === 'cancelled') return DENIED.cancelled;
      if (boundedSignal.wasTimedOut() || outcome.kind === 'timeout') return DENIED.timed_out;
      if (outcome.kind === 'error') return DENIED.dependency_failure;
      return Object.freeze({ status: 'executed', result: outcome.result });
    } catch {
      return DENIED.dependency_failure;
    } finally {
      boundedSignal.cleanup();
    }
  }

  return Object.freeze({ execute });
}

/**
 * Exercise write-like replay behavior in isolated Node tests only. This helper
 * is intentionally not returned by createToolExecutor, not registered as a
 * LangChain tool, and has no production ledger or handler wired to it.
 */
export function executeSyntheticEffectWithLedgerForTest(options) {
  return runSyntheticEffectWithLedger(options);
}
