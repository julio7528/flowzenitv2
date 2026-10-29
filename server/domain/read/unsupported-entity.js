import { DOMAIN_READ_ERROR_CODES, DomainReadError } from './errors.js';

const REQUESTED_ENTITY_TYPES = Object.freeze(['commitment', 'calendar']);
const SUPPORTED_ENTITIES = Object.freeze([
  'demand',
  'task',
  'subtask',
  'routineTemplate',
]);

/**
 * Build the stable limitation response for a standalone commitment/calendar
 * request. This is a pure contract helper: it reads no repository, creates no
 * identifier, and has no write capability.
 */
export function createUnsupportedEntityResponse(entityType = 'commitment') {
  if (!REQUESTED_ENTITY_TYPES.includes(entityType)) {
    throw new DomainReadError(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
  }

  return Object.freeze({
    error: Object.freeze({
      code: 'UNSUPPORTED_ENTITY',
      requestedEntity: entityType,
      message: 'The current domain model has no independent commitment or calendar entity.',
      supportedEntities: SUPPORTED_ENTITIES,
    }),
  });
}
