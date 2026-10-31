import { validateSearchResult } from '../../domain/read/contracts.js';
import { SPEC004_READ_TOOL_NAMES } from './state.js';
import {
  createUntrustedContentSegment,
  toUntrustedPromptSegments,
} from '../guardrails/untrusted-content.js';

const MAX_CONTEXT_CANDIDATES = 20;
const MAX_DISPLAY_CODE_POINTS = 256;
const EMPTY_WARNINGS = Object.freeze([]);
const READ_TOOL_NAME_SET = new Set(SPEC004_READ_TOOL_NAMES);

function unavailableContext(warning) {
  return Object.freeze({
    queryKind: 'postgres_text_search',
    state: 'unavailable',
    evidence: Object.freeze([]),
    warnings: Object.freeze([warning]),
  });
}

function boundedDisplayText(value) {
  const codePoints = Array.from(value);
  return {
    text: codePoints.length > MAX_DISPLAY_CODE_POINTS
      ? `${codePoints.slice(0, MAX_DISPLAY_CODE_POINTS).join('')}…`
      : value,
    truncated: codePoints.length > MAX_DISPLAY_CODE_POINTS,
  };
}

/**
 * Build a compact, source-cited prompt context from the validated SPEC-008
 * search result. Invalid provenance fails closed as unavailable, never empty.
 */
export function createSearchRetrievalContext(value) {
  let result;
  try {
    result = validateSearchResult(value);
  } catch {
    return unavailableContext('invalid_provenance');
  }

  if (result.metadata.freshness !== 'fresh') return unavailableContext('stale_source');
  if (result.metadata.resultState === 'empty') {
    return Object.freeze({
      queryKind: 'postgres_text_search',
      state: 'empty',
      evidence: Object.freeze([]),
      warnings: EMPTY_WARNINGS,
      readAt: result.metadata.readAt,
    });
  }

  const unique = new Map();
  for (const candidate of result.candidates) {
    const citationRef = `${candidate.kind}:${candidate.id}`;
    const previous = unique.get(citationRef);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(candidate)) {
        return unavailableContext('conflicting_provenance');
      }
      continue;
    }
    unique.set(citationRef, candidate);
  }

  const candidates = [...unique.values()];
  if (candidates.length === 0) return unavailableContext('invalid_provenance');
  const limited = candidates.length > MAX_CONTEXT_CANDIDATES;
  const displayTextLimited = candidates.some((candidate) => (
    Array.from(candidate.name).length > MAX_DISPLAY_CODE_POINTS
  ));
  const warnings = [];
  if (limited) warnings.push('candidate_context_limited');
  if (displayTextLimited) warnings.push('display_text_limited');

  const evidence = candidates.slice(0, MAX_CONTEXT_CANDIDATES).map((candidate) => {
    const display = boundedDisplayText(candidate.name);
    return Object.freeze({
      sourceType: candidate.kind,
      sourceId: candidate.id,
      displayText: display.text,
      parentChain: Object.freeze(candidate.hierarchyContext.map((entry) => entry.sourceRef)),
      citationRef: `${candidate.kind}:${candidate.id}`,
    });
  });
  const needsClarification = result.requiresNarrowing || limited || displayTextLimited;

  return Object.freeze({
    queryKind: 'postgres_text_search',
    state: needsClarification ? 'ambiguous' : 'complete',
    evidence: Object.freeze(evidence),
    warnings: Object.freeze(warnings),
    readAt: result.metadata.readAt,
    completeness: result.metadata.completeness,
  });
}

/** Prepare bounded answer evidence and data-only prompt content for one read result. */
export function prepareReadToolPrompt(toolName, result) {
  if (!READ_TOOL_NAME_SET.has(toolName)) throw new TypeError('Unknown read tool result.');
  const sourceRef = toolName === 'searchItems'
    ? 'SPEC-008/searchItems'
    : `SPEC-004/${toolName}`;
  const answerEvidence = toolName === 'searchItems'
    ? createSearchRetrievalContext(result)
    : result;
  const text = JSON.stringify(answerEvidence);
  if (typeof text !== 'string') throw new TypeError('Read tool output cannot be serialized.');
  const [segment] = toUntrustedPromptSegments([
    createUntrustedContentSegment({ sourceKind: 'retrieval', sourceRef, text }),
  ]);
  if (segment.trust !== 'untrusted' || segment.contentType !== 'data'
    || segment.sourceKind !== 'retrieval') {
    throw new TypeError('Retrieved text must remain untrusted prompt data.');
  }
  return Object.freeze({ content: JSON.stringify(segment), answerEvidence });
}

/** Serialize a read result as data-only prompt content with server provenance. */
export function serializeReadToolPromptContent(toolName, result) {
  return prepareReadToolPrompt(toolName, result).content;
}
