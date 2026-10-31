import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';
import {
  CreateRoutineSeriesInputSchema,
  createRoutineSeriesOutcome,
  isRoutineTemplateId,
} from './contracts.js';

assertServerOnlyRuntime();

const ROUTINE_TABLE = 'recorrente';
const ROUTINE_PROJECTION = 'id::text,demanda,hora,hora_fim,dias_semana,data_inicial,data_final';
const INSERT_ID_PROJECTION = 'id::text';
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;

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

function readPostgrestResult(value) {
  if (!isRecord(value)) return null;
  const data = readField(value, 'data');
  const error = readField(value, 'error');
  if (data === undefined || error === undefined) return null;
  return { data, error };
}

function canonicalTime(value) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return null;
  const [clock, fraction = ''] = value.split('.');
  const pieces = clock.split(':');
  const seconds = pieces[2] ?? '00';
  const normalizedFraction = fraction.replace(/0+$/, '');
  return `${pieces[0]}:${pieces[1]}:${seconds}${normalizedFraction ? `.${normalizedFraction}` : ''}`;
}

function expectedValues(input) {
  const parsed = CreateRoutineSeriesInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return Object.freeze({
    demanda: parsed.data.name,
    hora: canonicalTime(parsed.data.startTime),
    hora_fim: parsed.data.endTime === null ? null : canonicalTime(parsed.data.endTime),
    dias_semana: parsed.data.weekdaysISO,
    data_inicial: parsed.data.startDate,
    data_final: parsed.data.endDate,
  });
}

function insertedId(value) {
  const row = readOwnRecord(value, ['id']);
  return row && typeof row.id === 'string' && isRoutineTemplateId(row.id) ? row.id : null;
}

function readRoutineRow(value) {
  const row = readOwnRecord(value, [
    'id', 'demanda', 'hora', 'hora_fim', 'dias_semana', 'data_inicial', 'data_final',
  ]);
  if (!row || typeof row.id !== 'string' || !isRoutineTemplateId(row.id)
    || typeof row.demanda !== 'string'
    || !Array.isArray(row.dias_semana)
    || row.dias_semana.some(day => !Number.isInteger(day) || day < 1 || day > 7)
    || typeof row.data_inicial !== 'string'
    || typeof row.data_final !== 'string'
    || canonicalTime(row.hora) === null
    || (row.hora_fim !== null && canonicalTime(row.hora_fim) === null)) return null;
  return Object.freeze({
    id: row.id,
    demanda: row.demanda,
    hora: canonicalTime(row.hora),
    hora_fim: row.hora_fim === null ? null : canonicalTime(row.hora_fim),
    dias_semana: Object.freeze([...row.dias_semana]),
    data_inicial: row.data_inicial,
    data_final: row.data_final,
  });
}

function databaseErrorCode(value) {
  const code = readField(value, 'code');
  return typeof code === 'string' ? code : null;
}

function errorOutcome(error) {
  const code = databaseErrorCode(error);
  if (code === '42501') {
    return createRoutineSeriesOutcome({ outcome: 'DENIED', reasonCategory: 'ACCESS_DISABLED' });
  }
  if (['23502', '23514', '22007', '22008', '22023'].includes(code)) {
    return createRoutineSeriesOutcome({ outcome: 'VALIDATION_ERROR', reasonCategory: 'INVALID_INPUT' });
  }
  return createRoutineSeriesOutcome({ outcome: 'DEPENDENCY_UNAVAILABLE', reasonCategory: 'DEPENDENCY_UNAVAILABLE' });
}

function validateClient(client) {
  if (!isRecord(client) || typeof client.from !== 'function') {
    throw new TypeError('An injected Supabase JS client is required.');
  }
  return client;
}

/** Fixed-table one-row Supabase JS adapter with exact-ID read-back and no retry. */
export function createSupabaseRecurrenceRepository(injectedClient) {
  const client = validateClient(injectedClient);

  async function createRoutineSeries(input) {
    const expected = expectedValues(input);
    if (!expected) {
      return createRoutineSeriesOutcome({ outcome: 'VALIDATION_ERROR', reasonCategory: 'INVALID_INPUT' });
    }

    let insertQuery;
    try {
      insertQuery = client.from(ROUTINE_TABLE)
        .insert(expected)
        .select(INSERT_ID_PROJECTION);
    } catch {
      return createRoutineSeriesOutcome({ outcome: 'DEPENDENCY_UNAVAILABLE', reasonCategory: 'DEPENDENCY_UNAVAILABLE' });
    }

    let insertResult;
    try {
      insertResult = readPostgrestResult(await insertQuery);
    } catch {
      // The server may have committed before a transport failure. Never retry.
      return createRoutineSeriesOutcome({ outcome: 'DEPENDENCY_UNAVAILABLE', reasonCategory: 'DEPENDENCY_UNAVAILABLE' });
    }
    if (!insertResult) {
      return createRoutineSeriesOutcome({ outcome: 'DEPENDENCY_UNAVAILABLE', reasonCategory: 'DEPENDENCY_UNAVAILABLE' });
    }
    if (insertResult.error !== null) return errorOutcome(insertResult.error);
    if (!Array.isArray(insertResult.data) || insertResult.data.length !== 1) {
      return createRoutineSeriesOutcome({ outcome: 'DEPENDENCY_UNAVAILABLE', reasonCategory: 'DEPENDENCY_UNAVAILABLE' });
    }

    const id = insertedId(insertResult.data[0]);
    if (!id) {
      return createRoutineSeriesOutcome({ outcome: 'DEPENDENCY_UNAVAILABLE', reasonCategory: 'DEPENDENCY_UNAVAILABLE' });
    }

    let readbackQuery;
    try {
      readbackQuery = client.from(ROUTINE_TABLE)
        .select(ROUTINE_PROJECTION)
        .eq('id', id)
        .limit(1);
    } catch {
      return createRoutineSeriesOutcome({
        outcome: 'DEPENDENCY_UNAVAILABLE',
        persistentId: id,
        reasonCategory: 'DEPENDENCY_UNAVAILABLE',
      });
    }

    let readbackResult;
    try {
      readbackResult = readPostgrestResult(await readbackQuery);
    } catch {
      return createRoutineSeriesOutcome({
        outcome: 'DEPENDENCY_UNAVAILABLE',
        persistentId: id,
        reasonCategory: 'DEPENDENCY_UNAVAILABLE',
      });
    }
    if (!readbackResult || readbackResult.error !== null
      || !Array.isArray(readbackResult.data) || readbackResult.data.length !== 1) {
      return createRoutineSeriesOutcome({
        outcome: 'DEPENDENCY_UNAVAILABLE',
        persistentId: id,
        reasonCategory: 'DEPENDENCY_UNAVAILABLE',
      });
    }

    const row = readRoutineRow(readbackResult.data[0]);
    const matches = row
      && row.id === id
      && row.demanda === expected.demanda
      && row.hora === expected.hora
      && row.hora_fim === expected.hora_fim
      && row.data_inicial === expected.data_inicial
      && row.data_final === expected.data_final
      && JSON.stringify(row.dias_semana) === JSON.stringify(expected.dias_semana);
    if (!matches) {
      return createRoutineSeriesOutcome({
        outcome: 'DEPENDENCY_UNAVAILABLE',
        persistentId: id,
        reasonCategory: 'DEPENDENCY_UNAVAILABLE',
      });
    }

    return createRoutineSeriesOutcome({
      outcome: 'COMMITTED',
      persistentId: id,
      reasonCategory: 'SUCCESS',
    });
  }

  return Object.freeze({ createRoutineSeries });
}
