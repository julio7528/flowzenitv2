import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PRODUCTION_ACCESS_GATE } from '../runtime/capabilities.js';
import {
  DecimalIdSchema,
  MUTATION_OPERATIONS,
  MutationCommandSchema,
  validateMutationCommand,
} from '../../domain/write/contracts.js';
import { prepareHierarchyMutation } from '../../domain/write/hierarchy.js';
import { createMutationOutcome } from '../../domain/write/outcomes.js';

assertServerOnlyRuntime();

export const WRITE_CAPABILITY_VERSION = '1.0.0';
export const WRITE_CAPABILITY_NAMES = MUTATION_OPERATIONS;

const ACCESS_DISABLED = Object.freeze({ status: 'denied', reason: 'access_disabled' });
const INVALID_COMMAND = Object.freeze({ status: 'denied', reason: 'invalid_command' });
const DEPENDENCIES_UNSELECTED = Object.freeze({ status: 'unavailable', reason: 'write_dependencies_unselected' });
const AGENT_WRITE_OPERATIONS = new Set(['create_task', 'create_subtask']);
const AgentWriteInputSchema = z.strictObject({
  name: z.string().trim().min(1),
  parentId: DecimalIdSchema,
});
const CLOSED_ACCESS_GATE = Object.freeze({
  allowsWrite: async () => false,
});

function makeReadOnlyRegistry(entries) {
  const registry = new Map(entries);
  Object.defineProperties(registry, {
    set: { value: () => { throw new TypeError('The write capability registry is immutable.'); } },
    delete: { value: () => { throw new TypeError('The write capability registry is immutable.'); } },
    clear: { value: () => { throw new TypeError('The write capability registry is immutable.'); } },
  });
  return Object.freeze(registry);
}

function getAccessGate(value) {
  if (value === undefined) return CLOSED_ACCESS_GATE;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return CLOSED_ACCESS_GATE;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'allowsWrite');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
      return CLOSED_ACCESS_GATE;
    }
    return Object.freeze({ allowsWrite: descriptor.value });
  } catch {
    return CLOSED_ACCESS_GATE;
  }
}

function getWriteRepository(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0
      || Object.keys(descriptors).sort().join(',') !== 'createSubtask,createTask'
      || Object.values(descriptors).some(descriptor => !Object.hasOwn(descriptor, 'value')
        || typeof descriptor.value !== 'function')) return null;
    return Object.freeze({
      createTask: descriptors.createTask.value,
      createSubtask: descriptors.createSubtask.value,
    });
  } catch {
    return null;
  }
}

function safeMutationOutcome(operation, outcome, reasonCategory) {
  return createMutationOutcome({
    outcome,
    operation,
    operationVersion: 1,
    correlationId: randomUUID(),
    reasonCategory,
  });
}

/**
 * Build a server-only, allowlisted mutation registry. The present product gate
 * is closed unless the server injects the fixed Supabase repository and an
 * access gate. Only the two task/subtask create handlers can then be exposed
 * to the model; the other mutation DTOs remain preparation-only.
 */
export function createWriteCapabilityRegistry({ accessGate, writeRepository } = {}) {
  const gate = getAccessGate(accessGate);
  const repository = getWriteRepository(writeRepository);
  const entries = MUTATION_OPERATIONS.map((name) => {
    const hierarchyOperation = name.startsWith('create_') || name.startsWith('rename_');
    const execute = async (command) => {
      const validated = validateMutationCommand(command);
      if (!validated.valid || validated.command.operation !== name) return INVALID_COMMAND;

      // SPEC-001's separate server-side access control is not implemented.
      // Never invoke an injected gate, repository, Supabase client, or handler
      // while this production switch remains closed.
      if (PRODUCTION_ACCESS_GATE !== 'open') return ACCESS_DISABLED;

      let allowed = false;
      try {
        allowed = await gate.allowsWrite(Object.freeze({ operation: name, version: 1 }));
      } catch {
        allowed = false;
      }
      if (allowed !== true) {
        return AGENT_WRITE_OPERATIONS.has(name)
          ? safeMutationOutcome(name, 'DENIED', 'ACCESS_DISABLED')
          : ACCESS_DISABLED;
      }

      if (!repository || !AGENT_WRITE_OPERATIONS.has(name)) return DEPENDENCIES_UNSELECTED;

      try {
        const method = name === 'create_task' ? repository.createTask : repository.createSubtask;
        return await method(Object.freeze({
          name: validated.command.payload.name.trim(),
          parentId: validated.command.parentId,
        }));
      } catch {
        return safeMutationOutcome(name, 'DEPENDENCY_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE');
      }
    };

    const prepare = hierarchyOperation
      ? (command, parentRecord = null) => {
        const validated = validateMutationCommand(command);
        if (!validated.valid || validated.command.operation !== name) return null;
        return prepareHierarchyMutation(validated.command, parentRecord);
      }
      : null;

    const enabled = PRODUCTION_ACCESS_GATE === 'open'
      && repository !== null
      && AGENT_WRITE_OPERATIONS.has(name);
    const handler = enabled
      ? async (input) => {
        const parsed = AgentWriteInputSchema.safeParse(input);
        if (!parsed.success) return safeMutationOutcome(name, 'VALIDATION_ERROR', 'INVALID_INPUT');
        return execute({
          operation: name,
          version: 1,
          parentId: parsed.data.parentId,
          payload: { name: parsed.data.name },
        });
      }
      : null;

    return [name, Object.freeze({
      name,
      version: WRITE_CAPABILITY_VERSION,
      inputSchema: MutationCommandSchema,
      enabled,
      agentInputSchema: handler ? AgentWriteInputSchema : null,
      handler,
      prepare,
      execute,
    })];
  });

  return Object.freeze({ registry: makeReadOnlyRegistry(entries) });
}
