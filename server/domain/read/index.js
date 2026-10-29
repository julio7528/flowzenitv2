import { withDomainReadAccess } from './access.js';
import { mapDomainReadError } from './errors.js';
import { getHierarchy as readHierarchy } from './hierarchy.js';
import { getDailySchedule as readDailySchedule } from './daily-schedule.js';
import { getItemById as readItemById } from './lookup.js';
import { getRoutineTemplates as readRoutineTemplates } from './routine-templates.js';
import { searchItems as readSearchItems } from './search.js';
import { createUnsupportedEntityResponse } from './unsupported-entity.js';
import { getWeeklyAllocation as readWeeklyAllocation } from './weekly-allocation.js';

// Exported as a pure response contract for future SPEC-002 runtime routing. It
// is not a seventh read tool and does not enter or bypass the closed access gate.
export { createUnsupportedEntityResponse };

export const DOMAIN_READ_TOOL_NAMES = Object.freeze([
  'getHierarchy',
  'getItemById',
  'searchItems',
  'getDailySchedule',
  'getWeeklyAllocation',
  'getRoutineTemplates',
]);

function copyHierarchyCursorSecret(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) return undefined;
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(options, 'cursorSecret');
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) return undefined;
  return descriptor.value instanceof Uint8Array
    ? new Uint8Array(descriptor.value)
    : descriptor.value;
}

/**
 * Server-only tool factory. The repository and hierarchy cursor integrity key
 * are injected by the runtime; this module creates no Supabase client or
 * credentials, and every tool enters the SPEC-001 fail-closed wrapper first.
 */
export function createDomainReadTools(repository, options = {}) {
  const cursorSecret = copyHierarchyCursorSecret(options);

  async function gated(request, operation) {
    try {
      return await withDomainReadAccess(request, operation);
    } catch (cause) {
      return mapDomainReadError(cause);
    }
  }

  return Object.freeze({
    getHierarchy(request) {
      return gated(request, () => readHierarchy(repository, request, { cursorSecret }));
    },
    getItemById(request) {
      return gated(request, () => readItemById(repository, request));
    },
    searchItems(request) {
      return gated(request, () => readSearchItems(repository, request));
    },
    getDailySchedule(request) {
      return gated(request, () => readDailySchedule(repository, request));
    },
    getWeeklyAllocation(request) {
      return gated(request, () => readWeeklyAllocation(repository, request));
    },
    getRoutineTemplates(request) {
      return gated(request, () => readRoutineTemplates(repository, request));
    },
  });
}
