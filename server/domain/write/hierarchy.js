import { validateMutationCommand } from './contracts.js';
import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';

assertServerOnlyRuntime();

const CREATE_KIND = Object.freeze({
  create_demand: Object.freeze({ tipo: 1, parentTipo: null }),
  create_task: Object.freeze({ tipo: 2, parentTipo: 1 }),
  create_subtask: Object.freeze({ tipo: 3, parentTipo: 2 }),
});

function readParentIdentity(parentRecord) {
  if (parentRecord === null || typeof parentRecord !== 'object' || Array.isArray(parentRecord)) return null;
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(parentRecord);
    descriptors = Object.getOwnPropertyDescriptors(parentRecord);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(parentRecord).length > 0) return null;
  } catch {
    return null;
  }
  const id = descriptors.id;
  const tipo = descriptors.tipo;
  if (!id || !tipo || !Object.hasOwn(id, 'value') || !Object.hasOwn(tipo, 'value')) return null;
  return { id: id.value, tipo: tipo.value };
}

function freezeResult(operation, targetId, values) {
  return Object.freeze({
    operation,
    targetId,
    values: Object.freeze(values),
  });
}

/** Build a typed mutation command without performing any repository call. */
export function prepareHierarchyMutation(candidate, parentRecord = null) {
  const validation = validateMutationCommand(candidate);
  if (!validation.valid) return null;
  const command = validation.command;
  const createRule = CREATE_KIND[command.operation];

  if (createRule) {
    if (command.operation === 'create_demand') {
      if (parentRecord !== null || (command.parentId !== undefined && command.parentId !== null)) return null;
      return freezeResult(command.operation, null, {
        demanda: command.payload.name,
        tipo: createRule.tipo,
        raizid: null,
      });
    }

    const parent = readParentIdentity(parentRecord);
    if (!parent || parent.id !== command.parentId || parent.tipo !== createRule.parentTipo) return null;
    return freezeResult(command.operation, null, {
      demanda: command.payload.name,
      tipo: createRule.tipo,
      raizid: command.parentId,
    });
  }

  if (!command.operation.startsWith('rename_')) return null;
  return freezeResult(command.operation, command.targetId, {
    demanda: command.payload.name,
  });
}
