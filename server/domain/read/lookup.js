import {
  DOMAIN_READ_ERROR_CODES,
  DomainReadError,
} from './errors.js';
import {
  DOMAIN_KINDS,
  validateDecimalId,
  validateDomainItem,
  validateGetItemByIdRequest,
} from './contracts.js';

const KIND_BY_TYPE_ID = Object.freeze({ 1: 'demand', 2: 'task', 3: 'subtask' });

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function error(code) {
  return new DomainReadError(code);
}

function normalizeIdRequest(value) {
  return validateGetItemByIdRequest(typeof value === 'string' ? { itemId: value } : value);
}

/**
 * Map only the repository's fixed `demandas` projection into the public
 * domain DTO. The bigint IDs stay decimal strings and are never coerced to
 * JavaScript numbers.
 */
export function mapReadRowToDomainItem(row) {
  if (!isRecord(row)) throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);

  const kind = KIND_BY_TYPE_ID[row.tipo];
  if (!DOMAIN_KINDS.includes(kind)) throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);

  try {
    return validateDomainItem({
      id: validateDecimalId(row.id),
      name: row.demanda,
      kind,
      parentId: row.raizid,
      status: row.status,
      statusSource: kind === 'subtask' ? 'stored' : 'derived',
      executionDate: row.data_exec,
      startTime: row.hora_inicio,
      endTime: row.hora_fim,
      sourceRef: { kind, id: row.id },
    });
  } catch {
    // A malformed repository projection is an internal contract failure, not
    // invalid user input. Do not expose the underlying row or validation text.
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
}

/** Resolve an exact persistent ID, with the same not-found response for every miss. */
export async function getItemById(repository, input) {
  const { itemId } = normalizeIdRequest(input);
  if (!isRecord(repository) || typeof repository.getItemById !== 'function') {
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  let row;
  try {
    row = await repository.getItemById(itemId);
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  if (row === null || row === undefined) throw error(DOMAIN_READ_ERROR_CODES.NOT_FOUND);
  return mapReadRowToDomainItem(row);
}
