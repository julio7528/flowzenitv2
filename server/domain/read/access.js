import { withAgentAccess } from '../../security/accessGate.js';
import {
  DOMAIN_READ_ERROR_CODES,
  DomainReadError,
  mapDomainReadError,
} from './errors.js';

/**
 * Run a domain read only through the SPEC-001 access boundary.
 * A closed boundary is translated to the public domain-read error contract
 * before any repository callback can execute.
 */
export async function withDomainReadAccess(request, repositoryCallback) {
  const result = await withAgentAccess(request, repositoryCallback);

  if (result?.error?.code === 'CAPABILITY_DISABLED') {
    return mapDomainReadError(new DomainReadError(DOMAIN_READ_ERROR_CODES.ACCESS_DISABLED));
  }

  return result;
}
