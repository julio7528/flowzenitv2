import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { validatePageSize } from './contracts.js';
import { DOMAIN_READ_ERROR_CODES, DomainReadError } from './errors.js';

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 256;
const HIERARCHY_CURSOR_VERSION = 1;
const MAX_HIERARCHY_CURSOR_LENGTH = 16_384;
const HIERARCHY_CURSOR_FORMAT = 'h1';
const HIERARCHY_CURSOR_IV_LENGTH = 12;
const HIERARCHY_CURSOR_TAG_LENGTH = 16;
const HIERARCHY_CURSOR_KEY_LENGTH = 32;

function order(column, ascending = true, nullsFirst) {
  const options = { ascending };
  if (nullsFirst !== undefined) options.nullsFirst = nullsFirst;
  return Object.freeze({ column, options: Object.freeze(options) });
}

/**
 * Fixed query ordering contracts. Every list order ends with the persistent
 * bigint ID as a deterministic tie-breaker. Callers select only a named order.
 */
export const READ_ORDERINGS = Object.freeze({
  hierarchy: Object.freeze([
    order('tipo'),
    order('id'),
  ]),
  search: Object.freeze([
    order('demanda'),
    order('tipo'),
    order('id'),
  ]),
  dailySchedule: Object.freeze([
    order('hora_inicio', true, false),
    order('demanda'),
    order('id'),
  ]),
  weeklyAllocation: Object.freeze([
    order('data_exec', true, false),
    order('tipo'),
    order('id'),
  ]),
  routineTemplates: Object.freeze([
    order('hora'),
    order('id'),
  ]),
});

function invalidInput() {
  return new DomainReadError(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
}

function dependencyUnavailable() {
  return new DomainReadError(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidInput();
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw invalidInput();
    seen.add(value);
    const result = value.map(item => canonicalize(item, seen));
    seen.delete(value);
    return result;
  }
  if (!isPlainRecord(value)) throw invalidInput();
  if (seen.has(value) || Object.getOwnPropertySymbols(value).length > 0) throw invalidInput();

  seen.add(value);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalidInput();
    if (descriptor.value === undefined) continue;
    result[key] = canonicalize(descriptor.value, seen);
  }
  seen.delete(value);
  return result;
}

function cursorFilters(filters) {
  if (filters === undefined) return Object.freeze({});
  if (!isPlainRecord(filters)) throw invalidInput();

  const result = {};
  for (const key of Object.keys(filters)) {
    if (key === 'cursor' || key === 'pageSize') continue;
    const descriptor = Object.getOwnPropertyDescriptor(filters, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalidInput();
    if (descriptor.value !== undefined) result[key] = descriptor.value;
  }
  return canonicalize(result);
}

function bindingFor(filters, ordering, orderingSpec) {
  let serialized;
  try {
    serialized = JSON.stringify({
      filters: cursorFilters(filters),
      ordering,
      orderingSpec,
    });
  } catch {
    throw invalidInput();
  }
  if (typeof serialized !== 'string') throw invalidInput();
  return createHash('sha256').update(serialized, 'utf8').digest('base64url');
}

function decodeCursor(cursor, expectedBinding) {
  if (typeof cursor !== 'string'
    || cursor.length === 0
    || cursor.length > MAX_CURSOR_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw invalidInput();
  }

  let decoded;
  let payload;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) throw invalidInput();
    decoded = bytes.toString('utf8');
    payload = JSON.parse(decoded);
  } catch {
    throw invalidInput();
  }

  if (!isPlainRecord(payload)
    || Object.keys(payload).sort().join(',') !== 'binding,offset,v'
    || payload.v !== CURSOR_VERSION
    || !Number.isSafeInteger(payload.offset)
    || payload.offset < 0
    || typeof payload.binding !== 'string'
    || payload.binding !== expectedBinding) {
    throw invalidInput();
  }
  return payload.offset;
}

function encodeCursor(offset, binding) {
  const payload = JSON.stringify({ v: CURSOR_VERSION, offset, binding });
  const cursor = Buffer.from(payload, 'utf8').toString('base64url');
  if (cursor.length > MAX_CURSOR_LENGTH) throw invalidInput();
  return cursor;
}

function hierarchyBinding(itemId) {
  return bindingFor({ itemId }, 'hierarchy', READ_ORDERINGS.hierarchy);
}

function hierarchyCursorKey(secret) {
  if (!(secret instanceof Uint8Array) || secret.byteLength < HIERARCHY_CURSOR_KEY_LENGTH) {
    throw dependencyUnavailable();
  }
  return createHash('sha256').update(Buffer.from(secret)).digest();
}

function hierarchyCursorAssociatedData(itemId) {
  return Buffer.from(
    `${HIERARCHY_CURSOR_FORMAT}:${hierarchyBinding(itemId)}`,
    'utf8',
  );
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidInput();
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw invalidInput();
  return decoded;
}

/**
 * Encode the opaque continuation state for a compound hierarchy traversal.
 * The binding includes the persistent item ID and the fixed hierarchy order;
 * the cursor carries no snapshot guarantee across concurrent database edits.
 */
export function encodeHierarchyCursor(itemId, state, secret) {
  const key = hierarchyCursorKey(secret);
  const payload = {
    v: HIERARCHY_CURSOR_VERSION,
    type: 'hierarchy',
    binding: hierarchyBinding(itemId),
    state,
  };
  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw invalidInput();
  }
  if (typeof serialized !== 'string') throw invalidInput();

  const iv = randomBytes(HIERARCHY_CURSOR_IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(hierarchyCursorAssociatedData(itemId));
  const ciphertext = Buffer.concat([
    cipher.update(serialized, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const cursor = [
    HIERARCHY_CURSOR_FORMAT,
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
  if (cursor.length > MAX_HIERARCHY_CURSOR_LENGTH) throw invalidInput();
  return cursor;
}

/** Authenticate, decrypt, and bind the cursor to its original item/order. */
export function decodeHierarchyCursor(cursor, itemId, secret) {
  if (typeof cursor !== 'string'
    || cursor.length === 0
    || cursor.length > MAX_HIERARCHY_CURSOR_LENGTH
    || !cursor.startsWith(`${HIERARCHY_CURSOR_FORMAT}.`)) {
    throw invalidInput();
  }

  const [format, encodedIv, encodedCiphertext, extra] = cursor.split('.');
  if (format !== HIERARCHY_CURSOR_FORMAT || extra !== undefined) throw invalidInput();
  const iv = decodeBase64Url(encodedIv);
  const ciphertextAndTag = decodeBase64Url(encodedCiphertext);
  if (iv.length !== HIERARCHY_CURSOR_IV_LENGTH
    || ciphertextAndTag.length <= HIERARCHY_CURSOR_TAG_LENGTH) {
    throw invalidInput();
  }

  const key = hierarchyCursorKey(secret);
  let payload;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(hierarchyCursorAssociatedData(itemId));
    decipher.setAuthTag(ciphertextAndTag.subarray(-HIERARCHY_CURSOR_TAG_LENGTH));
    const plaintext = Buffer.concat([
      decipher.update(ciphertextAndTag.subarray(0, -HIERARCHY_CURSOR_TAG_LENGTH)),
      decipher.final(),
    ]).toString('utf8');
    payload = JSON.parse(plaintext);
  } catch {
    throw invalidInput();
  }

  if (!isPlainRecord(payload)
    || Object.keys(payload).sort().join(',') !== 'binding,state,type,v'
    || payload.v !== HIERARCHY_CURSOR_VERSION
    || payload.type !== 'hierarchy'
    || payload.binding !== hierarchyBinding(itemId)
    || !isPlainRecord(payload.state)) {
    throw invalidInput();
  }
  return payload.state;
}

function validateOptions(options) {
  if (!isPlainRecord(options)) throw invalidInput();
  const allowed = ['pageSize', 'cursor', 'filters', 'ordering'];
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) throw invalidInput();
  }

  const pageSize = validatePageSize(options.pageSize);
  const ordering = options.ordering;
  if (typeof ordering !== 'string' || !Object.hasOwn(READ_ORDERINGS, ordering)) {
    throw invalidInput();
  }

  return {
    pageSize,
    cursor: options.cursor,
    filters: options.filters,
    ordering,
    orderingSpec: READ_ORDERINGS[ordering],
  };
}

/**
 * Apply an allowlisted order and bounded page range to an injected Supabase
 * query builder. The cursor carries only an offset and digest binding; it never
 * contains the original filter text or database payload.
 */
export async function paginateReadQuery(query, input) {
  const options = validateOptions(input);
  const { pageSize, cursor, filters, ordering, orderingSpec } = options;
  if (cursor !== undefined && typeof cursor !== 'string') throw invalidInput();
  if (!query || typeof query.order !== 'function' || typeof query.range !== 'function') {
    throw dependencyUnavailable();
  }

  const binding = bindingFor(filters, ordering, orderingSpec);
  const offset = cursor === undefined ? 0 : decodeCursor(cursor, binding);
  if (offset > Number.MAX_SAFE_INTEGER - pageSize) throw invalidInput();

  let orderedQuery = query;
  try {
    for (const sort of orderingSpec) {
      orderedQuery = orderedQuery.order(sort.column, sort.options);
    }
    orderedQuery = orderedQuery.range(offset, offset + pageSize);
  } catch {
    throw dependencyUnavailable();
  }

  let result;
  try {
    result = await orderedQuery;
  } catch {
    throw dependencyUnavailable();
  }

  if (!isPlainRecord(result)) throw dependencyUnavailable();
  if (result.error !== null && result.error !== undefined) throw dependencyUnavailable();
  if (!Array.isArray(result.data)) throw dependencyUnavailable();

  const hasMore = result.data.length > pageSize;
  const items = Object.freeze(result.data.slice(0, pageSize));
  const nextCursor = hasMore ? encodeCursor(offset + pageSize, binding) : null;
  return Object.freeze({ items, hasMore, nextCursor });
}
