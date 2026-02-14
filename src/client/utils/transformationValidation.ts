/**
 * Transformation Validation - Validates data before and after transformation
 * 
 * Provides utilities for validating input and output data structures
 * to prevent transformation errors and data loss.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate BronWebsite structure before transformation
 */
export function validateBronWebsite(website: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!website || typeof website !== 'object') {
    errors.push('Website must be an object');
    return { valid: false, errors, warnings };
  }

  const w = website as Record<string, unknown>;

  // Required fields
  if (!w.titel || typeof w.titel !== 'string') {
    errors.push('titel is required and must be a string');
  }

  if (!w.url || typeof w.url !== 'string') {
    errors.push('url is required and must be a string');
  }

  if (!w.samenvatting || typeof w.samenvatting !== 'string') {
    errors.push('samenvatting is required and must be a string');
  }

  // Optional fields validation
  if (w.accepted !== undefined && w.accepted !== null && typeof w.accepted !== 'boolean') {
    errors.push('accepted must be a boolean or null');
  }

  if (w.website_types !== undefined && !Array.isArray(w.website_types)) {
    errors.push('website_types must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate CanonicalDocument structure before transformation
 */
export function validateCanonicalDocument(doc: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!doc || typeof doc !== 'object') {
    errors.push('Document must be an object');
    return { valid: false, errors, warnings };
  }

  const d = doc as Record<string, unknown>;

  // Required fields
  if (!d._id || typeof d._id !== 'string') {
    errors.push('_id is required and must be a string');
  }

  if (!d.title || typeof d.title !== 'string') {
    errors.push('title is required and must be a string');
  }

  if (!d.fullText || typeof d.fullText !== 'string') {
    errors.push('fullText is required and must be a string');
  }

  if (!d.documentType || typeof d.documentType !== 'string') {
    errors.push('documentType is required and must be a string');
  }

  // Optional fields validation
  if (d.dates !== undefined) {
    if (typeof d.dates !== 'object' || d.dates === null) {
      errors.push('dates must be an object');
    }
  }

  if (d.sourceMetadata !== undefined && typeof d.sourceMetadata !== 'object') {
    errors.push('sourceMetadata must be an object');
  }

  if (d.enrichmentMetadata !== undefined && typeof d.enrichmentMetadata !== 'object') {
    errors.push('enrichmentMetadata must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate Bron structure after transformation
 */
export function validateBron(bron: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!bron || typeof bron !== 'object') {
    errors.push('Bron must be an object');
    return { valid: false, errors, warnings };
  }

  const b = bron as Record<string, unknown>;

  // Required fields
  if (!b.id || typeof b.id !== 'string') {
    errors.push('id is required and must be a string');
  }

  if (!b.titel || typeof b.titel !== 'string') {
    errors.push('titel is required and must be a string');
  }

  if (!b.url || typeof b.url !== 'string') {
    errors.push('url is required and must be a string');
  }

  if (!b.samenvatting || typeof b.samenvatting !== 'string') {
    errors.push('samenvatting is required and must be a string');
  }

  if (!b.relevantie || typeof b.relevantie !== 'string') {
    errors.push('relevantie is required and must be a string');
  }

  if (!b.bron || typeof b.bron !== 'string') {
    errors.push('bron is required and must be a string');
  }

  if (!b.status || !['pending', 'approved', 'rejected'].includes(b.status as string)) {
    errors.push('status must be one of: pending, approved, rejected');
  }

  if (!b.type || !['website', 'document'].includes(b.type as string)) {
    errors.push('type must be one of: website, document');
  }

  // Optional fields validation
  if (b.metadata !== undefined) {
    if (typeof b.metadata !== 'object' || b.metadata === null) {
      errors.push('metadata must be an object');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}


