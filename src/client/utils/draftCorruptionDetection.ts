/**
 * Draft Corruption Detection - Detects and recovers from corrupted draft data
 * 
 * Provides utilities for detecting corrupted drafts and attempting recovery.
 */

import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';
import { validateContextState, sanitizeContextState } from './contextValidation';

export interface CorruptionCheckResult {
  isCorrupted: boolean;
  errors: string[];
  warnings: string[];
  recoverable: boolean;
  recoveredDraft?: BeleidsscanDraft;
}

/**
 * Check if draft data is corrupted
 */
export function checkDraftCorruption(draft: unknown): CorruptionCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if draft is an object
  if (!draft || typeof draft !== 'object') {
    return {
      isCorrupted: true,
      errors: ['Draft is not an object'],
      warnings: [],
      recoverable: false,
    };
  }

  const d = draft as Partial<BeleidsscanDraft>;

  // Check for required structure
  if (!d.timestamp || typeof d.timestamp !== 'string') {
    errors.push('Draft missing or invalid timestamp');
  }

  // Validate using context validation (draft structure is similar to context state)
  const validation = validateContextState(draft);
  if (!validation.valid) {
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }

  // Check for data type mismatches
  if (d.step !== undefined && (typeof d.step !== 'number' || d.step < 1 || d.step > 3)) {
    errors.push('Invalid step value');
  }

  if (d.selectedWebsites !== undefined && !Array.isArray(d.selectedWebsites)) {
    errors.push('selectedWebsites must be an array');
  }

  if (d.selectedDocuments !== undefined && !Array.isArray(d.selectedDocuments)) {
    errors.push('selectedDocuments must be an array');
  }

  if (d.documents !== undefined && !Array.isArray(d.documents)) {
    errors.push('documents must be an array');
  }

  // Check timestamp validity
  if (d.timestamp) {
    const timestamp = new Date(d.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      errors.push('Invalid timestamp format');
    }
  }

  const isCorrupted = errors.length > 0;
  const recoverable = errors.length > 0 && warnings.length === 0; // Recoverable if only errors, no warnings

  // Attempt recovery if possible
  let recoveredDraft: BeleidsscanDraft | undefined;
  if (isCorrupted && recoverable) {
    const sanitized = sanitizeContextState(draft);
    if (sanitized) {
      recoveredDraft = sanitized;
    }
  }

  return {
    isCorrupted,
    errors,
    warnings,
    recoverable,
    recoveredDraft,
  };
}

/**
 * Attempt to recover corrupted draft
 */
export function recoverCorruptedDraft(corruptedDraft: unknown): BeleidsscanDraft | null {
  const check = checkDraftCorruption(corruptedDraft);
  
  if (!check.isCorrupted) {
    // Not corrupted - return as-is
    return corruptedDraft as BeleidsscanDraft;
  }

  if (check.recoverable && check.recoveredDraft) {
    return check.recoveredDraft;
  }

  // Not recoverable
  return null;
}

/**
 * Validate draft before saving
 */
export function validateDraftBeforeSave(draft: BeleidsscanDraft): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (!draft.timestamp || typeof draft.timestamp !== 'string') {
    errors.push('Draft must have a valid timestamp');
  }

  // Validate structure
  const validation = validateContextState(draft);
  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


