import { z } from 'zod';

export const CONVERSATION_HISTORY_LIMITS = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 100,
});

export const CONVERSATION_MESSAGE_ROLES = Object.freeze([
  'user',
  'assistant',
  'tool_summary',
]);

export const CONVERSATION_HISTORY_OUTCOMES = Object.freeze([
  'ok',
  'empty',
  'invalid_id',
  'not_found',
  'access_disabled',
  'expired',
  'unavailable',
]);

export const CONVERSATION_ERROR_CODES = Object.freeze([
  'INVALID_CONVERSATION_ID',
  'INVALID_MESSAGE_ID',
  'INVALID_TURN_ID',
  'INVALID_HISTORY_REQUEST',
  'INVALID_HISTORY_CURSOR',
  'INVALID_HISTORY_PAGE',
  'INVALID_EXPORT',
  'NOT_FOUND',
  'ACCESS_DISABLED',
  'EXPIRED',
  'UNAVAILABLE',
  'IDEMPOTENCY_CONFLICT',
]);

const POSTGRES_BIGINT_MAX = 9223372036854775807n;
const UUIDSchema = z.uuid().transform((value) => value.toLowerCase());
const CursorSchema = z.string().min(1).refine((value) => !value.includes('\0'));
const NonNegativeSequenceSchema = z.string()
  .regex(/^(?:0|[1-9][0-9]*)$/)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX);
const PositiveSequenceSchema = z.string()
  .regex(/^[1-9][0-9]*$/)
  .refine((value) => BigInt(value) <= POSTGRES_BIGINT_MAX);
const TimestampSchema = z.iso.datetime({ offset: true });

const HistoryRequestSchema = z.strictObject({
  conversationId: UUIDSchema,
  cursor: CursorSchema.optional(),
  pageSize: z.number().int().min(1).max(CONVERSATION_HISTORY_LIMITS.maxPageSize).optional(),
});

const MessageSchema = z.strictObject({
  messageId: UUIDSchema,
  conversationId: UUIDSchema,
  messageSeq: PositiveSequenceSchema,
  turnId: UUIDSchema,
  role: z.enum(CONVERSATION_MESSAGE_ROLES),
  content: z.string(),
  createdAt: TimestampSchema,
});

/**
 * Cursor payload fields are validated only after the server-side cursor adapter
 * verifies its HMAC. The cursor itself remains opaque to callers and never
 * grants access to the conversation.
 */
const HistoryCursorPayloadSchema = z.strictObject({
  cursorVersion: z.literal(1),
  conversationId: UUIDSchema,
  pageSize: z.number().int().min(1).max(CONVERSATION_HISTORY_LIMITS.maxPageSize),
  snapshotMaxMessageSeq: NonNegativeSequenceSchema,
  lastMessageSeq: PositiveSequenceSchema,
}).refine((payload) => BigInt(payload.lastMessageSeq) <= BigInt(payload.snapshotMaxMessageSeq));

const HistorySuccessSchema = z.strictObject({
  outcome: z.enum(['ok', 'empty']),
  conversationId: UUIDSchema,
  messages: z.array(MessageSchema),
  nextCursor: CursorSchema.nullable(),
  snapshotMaxMessageSeq: NonNegativeSequenceSchema,
}).refine((page) => {
  if (page.outcome === 'empty') {
    return page.messages.length === 0 && page.nextCursor === null;
  }
  if (page.messages.length === 0) return false;

  let priorSequence = 0n;
  for (const message of page.messages) {
    const sequence = BigInt(message.messageSeq);
    if (message.conversationId !== page.conversationId
      || sequence <= priorSequence
      || sequence > BigInt(page.snapshotMaxMessageSeq)) {
      return false;
    }
    priorSequence = sequence;
  }

  return true;
});

const HistoryFailureSchema = z.strictObject({
  outcome: z.enum(['invalid_id', 'not_found', 'access_disabled', 'expired', 'unavailable']),
  messages: z.tuple([]),
  nextCursor: z.null(),
  snapshotMaxMessageSeq: z.null(),
});

const HistoryResultSchema = z.union([HistorySuccessSchema, HistoryFailureSchema]);

const ConversationExportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  conversation: z.strictObject({
    conversationId: UUIDSchema,
    createdAt: TimestampSchema,
  }),
  messages: z.array(MessageSchema),
  nextCursor: CursorSchema.nullable(),
  snapshotMaxMessageSeq: NonNegativeSequenceSchema,
}).refine((exportPage) => {
  let priorSequence = 0n;
  for (const message of exportPage.messages) {
    const sequence = BigInt(message.messageSeq);
    if (message.conversationId !== exportPage.conversation.conversationId
      || sequence <= priorSequence
      || sequence > BigInt(exportPage.snapshotMaxMessageSeq)) {
      return false;
    }
    priorSequence = sequence;
  }
  return true;
});

const SAFE_ERROR_MESSAGES = Object.freeze({
  INVALID_CONVERSATION_ID: 'The conversation identifier is invalid.',
  INVALID_MESSAGE_ID: 'The message identifier is invalid.',
  INVALID_TURN_ID: 'The turn identifier is invalid.',
  INVALID_HISTORY_REQUEST: 'The history request is invalid.',
  INVALID_HISTORY_CURSOR: 'The history cursor is invalid.',
  INVALID_HISTORY_PAGE: 'The history page is invalid.',
  INVALID_EXPORT: 'The conversation export is invalid.',
  NOT_FOUND: 'The conversation was not found.',
  ACCESS_DISABLED: 'Conversation access is disabled.',
  EXPIRED: 'The conversation is expired.',
  UNAVAILABLE: 'Conversation history is unavailable.',
  IDEMPOTENCY_CONFLICT: 'The request conflicts with an existing turn.',
});

function isPlainDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  return Object.values(Object.getOwnPropertyDescriptors(value))
    .every((descriptor) => Object.hasOwn(descriptor, 'value'));
}

function raiseContractError(code) {
  throw new ConversationContractError(code);
}

function parseOrRaise(schema, value, errorCode) {
  if (!isPlainDataRecord(value)) raiseContractError(errorCode);
  const parsed = schema.safeParse(value);
  if (!parsed.success) raiseContractError(errorCode);
  return parsed.data;
}

/** A stable, content-free contract error safe to map to an internal outcome. */
export class ConversationContractError extends Error {
  constructor(code) {
    if (!CONVERSATION_ERROR_CODES.includes(code)) {
      throw new TypeError('A supported conversation contract error code is required.');
    }
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = 'ConversationContractError';
    this.code = code;
  }
}

/** Validate an opaque UUID locator. A valid ID never authorizes access. */
export function validateConversationId(value) {
  const parsed = UUIDSchema.safeParse(value);
  if (!parsed.success) raiseContractError('INVALID_CONVERSATION_ID');
  return parsed.data;
}

/** Validate an opaque canonical message identifier without numeric coercion. */
export function validateMessageId(value) {
  const parsed = UUIDSchema.safeParse(value);
  if (!parsed.success) raiseContractError('INVALID_MESSAGE_ID');
  return parsed.data;
}

/** Validate an opaque turn identifier without treating it as an identity. */
export function validateTurnId(value) {
  const parsed = UUIDSchema.safeParse(value);
  if (!parsed.success) raiseContractError('INVALID_TURN_ID');
  return parsed.data;
}

/** Keep PostgreSQL bigint sequences as canonical decimal strings. */
export function validateMessageSequence(value, { allowZero = false } = {}) {
  const schema = allowZero ? NonNegativeSequenceSchema : PositiveSequenceSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) raiseContractError('INVALID_HISTORY_PAGE');
  return parsed.data;
}

/** Validate a history request and supply the contract's default page size. */
export function parseHistoryRequest(value) {
  if (!isPlainDataRecord(value)) raiseContractError('INVALID_HISTORY_REQUEST');

  const parsed = HistoryRequestSchema.safeParse(value);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === 'conversationId')) {
      raiseContractError('INVALID_CONVERSATION_ID');
    }
    if (parsed.error.issues.some((issue) => issue.path[0] === 'cursor')) {
      raiseContractError('INVALID_HISTORY_CURSOR');
    }
    raiseContractError('INVALID_HISTORY_REQUEST');
  }

  return Object.freeze({
    ...parsed.data,
    pageSize: parsed.data.pageSize ?? CONVERSATION_HISTORY_LIMITS.defaultPageSize,
  });
}

/** Validate an authenticated cursor payload after cryptographic verification. */
export function parseHistoryCursorPayload(value) {
  return parseOrRaise(HistoryCursorPayloadSchema, value, 'INVALID_HISTORY_CURSOR');
}

/** Validate and normalize a page; ordering and snapshot bounds are enforced. */
export function parseHistoryPage(value) {
  return parseOrRaise(HistorySuccessSchema, value, 'INVALID_HISTORY_PAGE');
}

/** Validate either a successful page or a content-free failure outcome. */
export function parseHistoryResult(value) {
  return parseOrRaise(HistoryResultSchema, value, 'INVALID_HISTORY_PAGE');
}

/** Validate a versioned paginated export DTO without exposing internal state. */
export function parseConversationExport(value) {
  return parseOrRaise(ConversationExportSchema, value, 'INVALID_EXPORT');
}

export const conversationContractSchemas = Object.freeze({
  ConversationId: UUIDSchema,
  MessageId: UUIDSchema,
  TurnId: UUIDSchema,
  MessageSequence: PositiveSequenceSchema,
  HistoryRequest: HistoryRequestSchema,
  Message: MessageSchema,
  HistoryCursorPayload: HistoryCursorPayloadSchema,
  HistoryPage: HistorySuccessSchema,
  HistoryResult: HistoryResultSchema,
  ConversationExport: ConversationExportSchema,
});
