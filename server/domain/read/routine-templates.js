import {
  getIsoWeekday,
  ROUTINE_TEMPLATE_KIND,
  createQueryResult,
  validateGetRoutineTemplatesRequest,
  validateRoutineTemplate,
} from './contracts.js';
import {
  DOMAIN_READ_ERROR_CODES,
  DomainReadError,
} from './errors.js';

function error(code) {
  return new DomainReadError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPage(page) {
  if (!isRecord(page)
    || !Array.isArray(page.items)
    || typeof page.hasMore !== 'boolean') {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }

  if (page.hasMore) {
    if (typeof page.nextCursor !== 'string' || page.nextCursor.length === 0) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }
  } else if (page.nextCursor !== null && page.nextCursor !== undefined) {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
}

function mapRoutineRow(row) {
  if (!isRecord(row)) throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);

  try {
    return validateRoutineTemplate({
      templateId: row.id,
      name: row.demanda,
      weekdaysISO: row.dias_semana,
      activeFrom: row.data_inicial,
      activeTo: row.data_final,
      startTime: row.hora,
      endTime: row.hora_fim,
      sourceRef: { kind: ROUTINE_TEMPLATE_KIND, id: row.id },
    });
  } catch {
    // A bad database projection is an internal contract error. Keep its row
    // and validation details out of any public error response.
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
}

/**
 * Read applicable routine templates for a canonical civil date.
 *
 * A routine remains a read-only template: this helper does not synthesize an
 * occurrence ID or create a standalone commitment. Requests for a separate
 * commitment must remain an explicit model limitation until a SPEC changes
 * the approved domain entities.
 */
export async function getRoutineTemplates(repository, input) {
  const request = validateGetRoutineTemplatesRequest(input);
  if (!isRecord(repository) || typeof repository.getRoutineTemplates !== 'function') {
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  let page;
  try {
    page = await repository.getRoutineTemplates(request);
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  assertPage(page);
  const weekday = getIsoWeekday(request.date);
  const items = page.items.map((row) => {
    const template = mapRoutineRow(row);
    if (template.activeFrom > request.date
      || request.date > template.activeTo
      || !template.weekdaysISO.includes(weekday)) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }
    return template;
  });

  return createQueryResult(items, {
    readAt: new Date().toISOString(),
    completeness: page.hasMore ? 'truncated' : 'complete',
    freshness: 'fresh',
    nextCursor: page.hasMore ? page.nextCursor : null,
  });
}
