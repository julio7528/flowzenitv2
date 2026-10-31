import { randomUUID } from 'node:crypto';
import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';
import { DecimalIdSchema, validateMutationCommand } from './contracts.js';
import { prepareHierarchyMutation } from './hierarchy.js';
import { categorizeMutationDatabaseError, createMutationOutcome } from './outcomes.js';

assertServerOnlyRuntime();

const DEMAND_TABLE = 'demandas';
const DEMAND_PROJECTION = 'id::text,demanda,tipo,raizid::text,status,data_exec,hora_inicio,hora_fim';
const INSERT_ID_PROJECTION = 'id::text';
const EXPECTED_PARENT_TYPE = Object.freeze({ create_task: 1, create_subtask: 2 });
const CREATED_TYPE = Object.freeze({ create_task: 2, create_subtask: 3 });

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readOwnRecord(value, allowedKeys = null) {
  if (!isRecord(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Object.keys(descriptors);
    if (Object.values(descriptors).some(item => !item.enumerable || !Object.hasOwn(item, 'value'))) return null;
    if (allowedKeys && names.some(name => !allowedKeys.includes(name))) return null;
    return Object.fromEntries(names.map(name => [name, descriptors[name].value]));
  } catch {
    return null;
  }
}

function readField(value, name) {
  if (!isRecord(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function makeOutcome(operation, outcome, reasonCategory, extra = {}) {
  return createMutationOutcome({
    outcome,
    operation,
    operationVersion: 1,
    correlationId: randomUUID(),
    reasonCategory,
    ...extra,
  });
}

function invalidInputOutcome(operation) {
  return makeOutcome(operation, 'VALIDATION_ERROR', 'INVALID_INPUT');
}

function dependencyOutcome(operation, persistentId = undefined) {
  return makeOutcome(operation, 'DEPENDENCY_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE',
    persistentId === undefined ? {} : { persistentId });
}

function errorOutcome(operation, error) {
  const reasonCategory = categorizeMutationDatabaseError(error);
  if (reasonCategory === 'ACCESS_DISABLED') {
    return makeOutcome(operation, 'DENIED', reasonCategory);
  }
  if (['INVALID_INPUT', 'INVALID_PARENT', 'NOT_FOUND', 'SCHEDULE_CONFLICT'].includes(reasonCategory)) {
    return makeOutcome(operation, 'VALIDATION_ERROR', reasonCategory);
  }
  if (reasonCategory === 'STALE_STATE') {
    return makeOutcome(operation, 'CONFLICT', reasonCategory);
  }
  if (['DEPENDENCY_UNAVAILABLE', 'POLICY_UNAVAILABLE'].includes(reasonCategory)) {
    return makeOutcome(operation, 'DEPENDENCY_UNAVAILABLE', reasonCategory);
  }
  return makeOutcome(operation, 'FAILED', reasonCategory);
}

function readPostgrestResult(value) {
  if (!isRecord(value)) return null;
  const data = readField(value, 'data');
  const error = readField(value, 'error');
  if (data === undefined || error === undefined) return null;
  return { data, error };
}

function readCreateCommand(operation, candidate) {
  const input = readOwnRecord(candidate, ['name', 'parentId']);
  if (!input || Object.keys(input).length !== 2 || typeof input.name !== 'string') return null;
  const command = validateMutationCommand({
    operation,
    version: 1,
    parentId: input.parentId,
    payload: { name: input.name.trim() },
  });
  return command.valid ? command.command : null;
}

function readParentRow(value, expectedId) {
  const row = readOwnRecord(value);
  if (!row || typeof row.id !== 'string' || !DecimalIdSchema.safeParse(row.id).success
    || row.id !== expectedId || !Number.isInteger(row.tipo)
    || (row.data_exec !== null && typeof row.data_exec !== 'string')) return null;
  return row;
}

function readInsertedId(value) {
  const row = readOwnRecord(value, ['id']);
  if (!row || typeof row.id !== 'string' || !DecimalIdSchema.safeParse(row.id).success) return null;
  return row.id;
}

function confirmedRow(value) {
  const row = readOwnRecord(value);
  if (!row || typeof row.id !== 'string' || !DecimalIdSchema.safeParse(row.id).success
    || typeof row.demanda !== 'string' || !Number.isInteger(row.tipo)
    || (row.raizid !== null && typeof row.raizid !== 'string')) return null;
  return row;
}

function validateClient(client) {
  if (!isRecord(client) || typeof client.from !== 'function') {
    throw new TypeError('A server-side Supabase JS client is required.');
  }
  return client;
}

/**
 * Fixed-table Supabase JS adapter for one task or subtask create and exact-ID
 * read-back. It never creates a client, retries an insert, or accepts table or
 * column names from a request.
 */
export function createSupabaseWriteRepository(injectedClient) {
  const client = validateClient(injectedClient);

  async function readById(id) {
    let query;
    try {
      query = client.from(DEMAND_TABLE)
        .select(DEMAND_PROJECTION)
        .eq('id', id)
        .limit(1);
    } catch {
      return { kind: 'dependency' };
    }

    let response;
    try { response = readPostgrestResult(await query); }
    catch { return { kind: 'dependency' }; }
    if (!response) return { kind: 'dependency' };
    if (response.error !== null) return { kind: 'error', error: response.error };
    if (!Array.isArray(response.data)) return { kind: 'dependency' };
    if (response.data.length === 0) return { kind: 'empty' };
    if (response.data.length !== 1) return { kind: 'dependency' };
    const row = confirmedRow(response.data[0]);
    return row ? { kind: 'row', row } : { kind: 'dependency' };
  }

  async function create(operation, candidate) {
    const command = readCreateCommand(operation, candidate);
    if (!command) return invalidInputOutcome(operation);

    let parentQuery;
    try {
      parentQuery = client.from(DEMAND_TABLE)
        .select(DEMAND_PROJECTION)
        .eq('id', command.parentId)
        .limit(1);
    } catch {
      return dependencyOutcome(operation);
    }

    let parentResult;
    try { parentResult = readPostgrestResult(await parentQuery); }
    catch { return dependencyOutcome(operation); }
    if (!parentResult) return dependencyOutcome(operation);
    if (parentResult.error !== null) return errorOutcome(operation, parentResult.error);
    if (!Array.isArray(parentResult.data)) return dependencyOutcome(operation);
    if (parentResult.data.length === 0) return makeOutcome(operation, 'VALIDATION_ERROR', 'NOT_FOUND');
    if (parentResult.data.length !== 1) return dependencyOutcome(operation);

    const parent = readParentRow(parentResult.data[0], command.parentId);
    if (!parent) return dependencyOutcome(operation);
    if (parent.tipo !== EXPECTED_PARENT_TYPE[operation]) {
      return makeOutcome(operation, 'VALIDATION_ERROR', 'INVALID_PARENT');
    }
    if (operation === 'create_task' && parent.data_exec !== null) {
      return makeOutcome(operation, 'VALIDATION_ERROR', 'SCHEDULE_CONFLICT');
    }

    const prepared = prepareHierarchyMutation(command, {
      id: parent.id,
      tipo: parent.tipo,
      data_exec: parent.data_exec,
    });
    if (!prepared) return makeOutcome(operation, 'VALIDATION_ERROR', 'INVALID_PARENT');

    let insertQuery;
    try {
      insertQuery = client.from(DEMAND_TABLE)
        .insert(prepared.values)
        .select(INSERT_ID_PROJECTION);
    } catch {
      return dependencyOutcome(operation);
    }

    let insertResult;
    try { insertResult = readPostgrestResult(await insertQuery); }
    catch {
      // A transport failure can happen after the server committed the insert.
      // Treat it as uncertain and never retry automatically.
      return dependencyOutcome(operation);
    }
    if (!insertResult) return dependencyOutcome(operation);
    if (insertResult.error !== null) return errorOutcome(operation, insertResult.error);
    if (!Array.isArray(insertResult.data) || insertResult.data.length !== 1) {
      return dependencyOutcome(operation);
    }
    const insertedId = readInsertedId(insertResult.data[0]);
    if (!insertedId) return dependencyOutcome(operation);

    const readback = await readById(insertedId);
    if (readback.kind === 'error') return dependencyOutcome(operation, insertedId);
    if (readback.kind !== 'row') return dependencyOutcome(operation, insertedId);
    const row = readback.row;
    const expectedType = CREATED_TYPE[operation];
    if (row.id !== insertedId || row.demanda !== command.payload.name
      || row.tipo !== expectedType || row.raizid !== command.parentId) {
      return dependencyOutcome(operation, insertedId);
    }

    return makeOutcome(operation, 'COMMITTED', 'SUCCESS', {
      persistentId: insertedId,
      resultingValues: { name: row.demanda },
    });
  }

  return Object.freeze({
    createTask: input => create('create_task', input),
    createSubtask: input => create('create_subtask', input),
  });
}
