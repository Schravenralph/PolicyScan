/**
 * Context Validation - Validates context state structure and integrity
 * 
 * Provides utilities for validating context state to prevent corruption
 * and ensure data integrity.
 */

import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate context state structure
 */
export function validateContextState(state: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if state is an object
  if (!state || typeof state !== 'object') {
    errors.push('Context state must be an object');
    return { valid: false, errors, warnings };
  }

  const draft = state as Partial<BeleidsscanDraft>;

  // Validate step
  if (draft.step !== undefined) {
    if (typeof draft.step !== 'number' || draft.step < 1 || draft.step > 3) {
      errors.push('Step must be a number between 1 and 3');
    }
  }

  // Validate overheidslaag
  if (draft.overheidslaag !== undefined && draft.overheidslaag !== null) {
    const validLagen = ['gemeente', 'waterschap', 'provincie', 'rijk', 'kennisinstituut'];
    if (typeof draft.overheidslaag !== 'string' || !validLagen.includes(draft.overheidslaag)) {
      errors.push('Invalid overheidslaag value');
    }
  }

  // Validate selectedWebsites
  if (draft.selectedWebsites !== undefined) {
    if (!Array.isArray(draft.selectedWebsites)) {
      errors.push('selectedWebsites must be an array');
    } else {
      const invalidIds = draft.selectedWebsites.filter(id => typeof id !== 'string');
      if (invalidIds.length > 0) {
        errors.push('selectedWebsites must contain only strings');
      }
    }
  }

  // Validate selectedDocuments
  if (draft.selectedDocuments !== undefined) {
    if (!Array.isArray(draft.selectedDocuments)) {
      errors.push('selectedDocuments must be an array');
    } else {
      const invalidIds = draft.selectedDocuments.filter(id => typeof id !== 'string');
      if (invalidIds.length > 0) {
        errors.push('selectedDocuments must contain only strings');
      }
    }
  }

  // Validate documents
  if (draft.documents !== undefined) {
    if (!Array.isArray(draft.documents)) {
      errors.push('documents must be an array');
    }
  }

  // Validate queryId
  if (draft.queryId !== undefined && draft.queryId !== null) {
    if (typeof draft.queryId !== 'string' || draft.queryId.trim() === '') {
      warnings.push('queryId should be a non-empty string if provided');
    }
  }

  // Validate onderwerp
  if (draft.onderwerp !== undefined && draft.onderwerp !== null) {
    if (typeof draft.onderwerp !== 'string') {
      errors.push('onderwerp must be a string');
    } else if (draft.onderwerp.trim() === '' && draft.step && draft.step >= 1) {
      warnings.push('onderwerp should not be empty for step 1');
    }
  }

  // Validate websiteSortBy
  if (draft.websiteSortBy !== undefined) {
    const validSortBy = ['relevance', 'name', 'type'];
    if (!validSortBy.includes(draft.websiteSortBy)) {
      errors.push('Invalid websiteSortBy value');
    }
  }

  // Validate documentFilter
  if (draft.documentFilter !== undefined) {
    const validFilters = ['all', 'pending', 'approved', 'rejected'];
    if (!validFilters.includes(draft.documentFilter)) {
      errors.push('Invalid documentFilter value');
    }
  }

  // Validate documentSortBy
  if (draft.documentSortBy !== undefined) {
    const validSortBy = ['relevance', 'date', 'title', 'website'];
    if (!validSortBy.includes(draft.documentSortBy)) {
      errors.push('Invalid documentSortBy value');
    }
  }

  // Validate documentSortDirection
  if (draft.documentSortDirection !== undefined) {
    const validDirections = ['asc', 'desc'];
    if (!validDirections.includes(draft.documentSortDirection)) {
      errors.push('Invalid documentSortDirection value');
    }
  }

  // Validate scrollPositions
  if (draft.scrollPositions !== undefined) {
    if (typeof draft.scrollPositions !== 'object' || draft.scrollPositions === null) {
      errors.push('scrollPositions must be an object');
    } else {
      const scrollPos = draft.scrollPositions as Record<string, unknown>;
      for (const [key, value] of Object.entries(scrollPos)) {
        if (typeof value !== 'number' || value < 0) {
          errors.push(`scrollPositions[${key}] must be a non-negative number`);
        }
      }
    }
  }

  // Validate timestamp
  if (draft.timestamp !== undefined) {
    if (typeof draft.timestamp !== 'string') {
      errors.push('timestamp must be a string');
    } else {
      const date = new Date(draft.timestamp);
      if (Number.isNaN(date.getTime())) {
        errors.push('timestamp must be a valid ISO date string');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Sanitize context state by removing invalid fields
 */
export function sanitizeContextState(state: unknown): BeleidsscanDraft | null {
  const validation = validateContextState(state);
  
  if (!validation.valid) {
    return null;
  }

  const draft = state as BeleidsscanDraft;
  
  // Create sanitized state with only valid fields
  const sanitized: BeleidsscanDraft = {};

  // Copy valid fields
  if (draft.step !== undefined) sanitized.step = draft.step;
  if (draft.overheidslaag !== undefined) sanitized.overheidslaag = draft.overheidslaag;
  if (draft.selectedEntity !== undefined) sanitized.selectedEntity = draft.selectedEntity;
  if (draft.onderwerp !== undefined) sanitized.onderwerp = draft.onderwerp;
  if (draft.queryId !== undefined) sanitized.queryId = draft.queryId;
  if (draft.selectedWebsites !== undefined) sanitized.selectedWebsites = draft.selectedWebsites;
  if (draft.websiteSearchQuery !== undefined) sanitized.websiteSearchQuery = draft.websiteSearchQuery;
  if (draft.websiteSortBy !== undefined) sanitized.websiteSortBy = draft.websiteSortBy;
  if (draft.websiteFilterType !== undefined) sanitized.websiteFilterType = draft.websiteFilterType;
  if (draft.documents !== undefined) sanitized.documents = draft.documents;
  if (draft.documentFilter !== undefined) sanitized.documentFilter = draft.documentFilter;
  if (draft.documentSortBy !== undefined) sanitized.documentSortBy = draft.documentSortBy;
  if (draft.documentSortDirection !== undefined) sanitized.documentSortDirection = draft.documentSortDirection;
  if (draft.documentSearchQuery !== undefined) sanitized.documentSearchQuery = draft.documentSearchQuery;
  if (draft.documentTypeFilter !== undefined) sanitized.documentTypeFilter = draft.documentTypeFilter;
  if (draft.documentDateFilter !== undefined) sanitized.documentDateFilter = draft.documentDateFilter;
  if (draft.documentWebsiteFilter !== undefined) sanitized.documentWebsiteFilter = draft.documentWebsiteFilter;
  if (draft.selectedDocuments !== undefined) sanitized.selectedDocuments = draft.selectedDocuments;
  if (draft.scrollPositions !== undefined) sanitized.scrollPositions = draft.scrollPositions;
  if (draft.timestamp !== undefined) sanitized.timestamp = draft.timestamp;

  return sanitized;
}


