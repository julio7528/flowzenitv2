const HASH_PATTERN = /^[a-f0-9]{64}$/;

/** Normalize a relative file or directory scope using the workspace path rules. */
export function normalizeFileScope(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('Writable file scope must be a non-empty relative path.');
  }

  let scope = value.trim().replaceAll('\\', '/').replace(/\/{2,}/g, '/');
  if (scope.startsWith('/') || /^[a-z]:/i.test(scope)) {
    throw new TypeError('Writable file scope cannot be absolute.');
  }
  scope = scope.replace(/^(?:\.\/)+/, '');
  scope = scope.replace(/\/\*\*\/?$/, '').replace(/\/+$/, '');
  if (!scope || scope.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new TypeError('Writable file scope cannot contain empty or traversal paths.');
  }
  if (/[?*]/.test(scope)) {
    throw new TypeError('Writable file scope may use only a trailing /** directory marker.');
  }
  return scope.toLocaleLowerCase('en-US');
}

/** Compare exact file paths and directory prefixes without matching partial names. */
export function fileScopesOverlap(left, right) {
  const a = normalizeFileScope(left);
  const b = normalizeFileScope(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** Pure fail-closed admission policy mirrored by the database supervisor. */
export function evaluateIndependentBatchAdmission({
  manifestHash,
  manifestHashCurrent,
  items,
  completedSpecIds = [],
  activeSpecIds = [],
  requestedScopes = [],
  activeScopes = [],
} = {}) {
  const reasons = [];
  if (!HASH_PATTERN.test(manifestHash || '') || manifestHash !== manifestHashCurrent) {
    reasons.push('manifest_hash_mismatch');
  }
  if (!Array.isArray(items) || items.length === 0) {
    reasons.push('manifest_items_missing');
  }

  const completed = new Set(completedSpecIds);
  const active = new Set(activeSpecIds);
  const seenBefore = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.specId !== 'string' || !Array.isArray(item.dependencies || [])) {
      reasons.push('manifest_item_invalid');
      continue;
    }
    if (active.has(item.specId)) reasons.push('duplicate_active_spec');
    for (const dependency of item.dependencies || []) {
      if (!completed.has(dependency) && !seenBefore.has(dependency)) {
        reasons.push('dependency_missing_or_out_of_order');
      }
    }
    seenBefore.add(item.specId);
  }

  if (!Array.isArray(requestedScopes) || requestedScopes.length === 0) {
    reasons.push('writable_scopes_unverified');
  }
  try {
    for (const requestedScope of requestedScopes || []) normalizeFileScope(requestedScope);
    for (const activeScope of activeScopes || []) {
      const hasActiveWork = activeScope
        && (activeScope.hasLiveLease === true || activeScope.hasOpenCorrectionWindow === true);
      if (!hasActiveWork) continue;
      if (typeof activeScope.scope !== 'string') {
        reasons.push('active_writable_scope_unverified');
        continue;
      }
      if ((requestedScopes || []).some((requested) => fileScopesOverlap(requested, activeScope.scope))) {
        reasons.push('overlapping_writable_scope');
      }
    }
  } catch {
    reasons.push('writable_scope_invalid');
  }

  return { allowed: reasons.length === 0, reasons: [...new Set(reasons)] };
}
