/**
 * ParsedDocumentValidator - Validates parsed documents
 * 
 * Ensures that ParsedDocument objects meet quality and structure requirements
 * before they are used by downstream layers (evaluation, scoring, reporting).
 */

import { logger } from '../../../utils/logger.js';
import type { ParsedDocument } from '../types/ParsedDocument.js';
import type { PolicyRule } from '../types/PolicyRule.js';
import type { Citation } from '../types/Citation.js';
import type { BaseEntity } from '../../../domain/ontology.js';

/**
 * Validation result for a parsed document
 */
export interface ValidationResult {
  /** Whether the document is valid */
  isValid: boolean;
  /** Array of validation errors (if any) */
  errors: ValidationError[];
  /** Array of validation warnings (if any) */
  warnings: ValidationWarning[];
}

/**
 * Validation error (document is invalid)
 */
export interface ValidationError {
  /** Field or aspect that failed validation */
  field: string;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
}

/**
 * Validation warning (document is valid but has issues)
 */
export interface ValidationWarning {
  /** Field or aspect that has a warning */
  field: string;
  /** Warning message */
  message: string;
  /** Warning code for programmatic handling */
  code: string;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Require at least one rule to be extracted */
  requireRules?: boolean;
  /** Require at least one entity to be extracted */
  requireEntities?: boolean;
  /** Require at least one citation to be extracted */
  requireCitations?: boolean;
  /** Minimum content length (characters) */
  minContentLength?: number;
  /** Maximum content length (characters) */
  maxContentLength?: number;
  /** Require document type to be set */
  requireDocumentType?: boolean;
  /** Require metadata to be present */
  requireMetadata?: boolean;
  /** Validate rule structure */
  validateRules?: boolean;
  /** Validate entity structure */
  validateEntities?: boolean;
  /** Validate citation structure */
  validateCitations?: boolean;
}

/**
 * Default validation options
 */
const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  requireRules: false,
  requireEntities: false,
  requireCitations: false,
  minContentLength: 0,
  maxContentLength: Number.MAX_SAFE_INTEGER,
  requireDocumentType: false,
  requireMetadata: false,
  validateRules: true,
  validateEntities: true,
  validateCitations: true,
};

/**
 * Validator for parsed documents
 */
export class ParsedDocumentValidator {
  /**
   * Validate a parsed document
   * 
   * @param document - Parsed document to validate
   * @param options - Validation options
   * @returns Validation result
   */
  validate(document: ParsedDocument, options: ValidationOptions = {}): ValidationResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate required fields
    this.validateRequiredFields(document, errors);

    // Validate content
    this.validateContent(document, opts, errors, warnings);

    // Validate document type
    if (opts.requireDocumentType) {
      this.validateDocumentType(document, errors);
    }

    // Validate metadata
    if (opts.requireMetadata) {
      this.validateMetadata(document, errors);
    }

    // Validate rules
    if (opts.validateRules) {
      this.validateRules(document.rules, errors, warnings);
    }
    if (opts.requireRules && document.rules.length === 0) {
      errors.push({
        field: 'rules',
        message: 'Document must have at least one extracted rule',
        code: 'REQUIRED_RULES_MISSING',
      });
    }

    // Validate entities
    if (opts.validateEntities) {
      this.validateEntities(document.entities, errors, warnings);
    }
    if (opts.requireEntities && document.entities.length === 0) {
      errors.push({
        field: 'entities',
        message: 'Document must have at least one extracted entity',
        code: 'REQUIRED_ENTITIES_MISSING',
      });
    }

    // Validate citations
    if (opts.validateCitations) {
      this.validateCitations(document.citations, errors, warnings);
    }
    if (opts.requireCitations && document.citations.length === 0) {
      errors.push({
        field: 'citations',
        message: 'Document must have at least one extracted citation',
        code: 'REQUIRED_CITATIONS_MISSING',
      });
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      logger.warn(
        {
          sourceId: document.sourceId,
          errorCount: errors.length,
          warningCount: warnings.length,
          errors: errors.map(e => e.code),
        },
        '[ParsedDocumentValidator] Document validation failed'
      );
    } else if (warnings.length > 0) {
      logger.debug(
        {
          sourceId: document.sourceId,
          warningCount: warnings.length,
          warnings: warnings.map(w => w.code),
        },
        '[ParsedDocumentValidator] Document validation passed with warnings'
      );
    }

    return {
      isValid,
      errors,
      warnings,
    };
  }

  /**
   * Validate required fields
   */
  private validateRequiredFields(document: ParsedDocument, errors: ValidationError[]): void {
    if (!document.sourceId || document.sourceId.trim().length === 0) {
      errors.push({
        field: 'sourceId',
        message: 'sourceId is required and cannot be empty',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }

    if (!document.sourceUrl || document.sourceUrl.trim().length === 0) {
      errors.push({
        field: 'sourceUrl',
        message: 'sourceUrl is required and cannot be empty',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }

    if (!document.title || document.title.trim().length === 0) {
      errors.push({
        field: 'title',
        message: 'title is required and cannot be empty',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }

    if (typeof document.content !== 'string') {
      errors.push({
        field: 'content',
        message: 'content must be a string',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }
    // Note: Empty content is allowed (will be warned in validateContent)

    if (!document.parsedAt || !(document.parsedAt instanceof Date)) {
      errors.push({
        field: 'parsedAt',
        message: 'parsedAt is required and must be a Date',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }

    if (!Array.isArray(document.rules)) {
      errors.push({
        field: 'rules',
        message: 'rules must be an array',
        code: 'INVALID_FIELD_TYPE',
      });
    }

    if (!Array.isArray(document.entities)) {
      errors.push({
        field: 'entities',
        message: 'entities must be an array',
        code: 'INVALID_FIELD_TYPE',
      });
    }

    if (!Array.isArray(document.citations)) {
      errors.push({
        field: 'citations',
        message: 'citations must be an array',
        code: 'INVALID_FIELD_TYPE',
      });
    }

    if (!document.metadata || typeof document.metadata !== 'object') {
      errors.push({
        field: 'metadata',
        message: 'metadata is required and must be an object',
        code: 'REQUIRED_FIELD_MISSING',
      });
    }
  }

  /**
   * Validate content
   */
  private validateContent(
    document: ParsedDocument,
    options: Required<ValidationOptions>,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (typeof document.content !== 'string') {
      return; // Already caught by required fields validation
    }

    const contentLength = document.content.length;

    if (contentLength < options.minContentLength) {
      errors.push({
        field: 'content',
        message: `Content length (${contentLength}) is below minimum (${options.minContentLength})`,
        code: 'CONTENT_TOO_SHORT',
      });
    }

    if (contentLength > options.maxContentLength) {
      errors.push({
        field: 'content',
        message: `Content length (${contentLength}) exceeds maximum (${options.maxContentLength})`,
        code: 'CONTENT_TOO_LONG',
      });
    }

    if (contentLength === 0) {
      warnings.push({
        field: 'content',
        message: 'Content is empty',
        code: 'EMPTY_CONTENT',
      });
    }
  }

  /**
   * Validate document type
   */
  private validateDocumentType(document: ParsedDocument, errors: ValidationError[]): void {
    if (!document.documentType || document.documentType.trim().length === 0) {
      errors.push({
        field: 'documentType',
        message: 'documentType is required',
        code: 'REQUIRED_DOCUMENT_TYPE_MISSING',
      });
    }
  }

  /**
   * Validate metadata
   */
  private validateMetadata(document: ParsedDocument, errors: ValidationError[]): void {
    if (!document.metadata || Object.keys(document.metadata).length === 0) {
      errors.push({
        field: 'metadata',
        message: 'metadata is required and cannot be empty',
        code: 'REQUIRED_METADATA_MISSING',
      });
    }
  }

  /**
   * Validate rules
   */
  private validateRules(
    rules: PolicyRule[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      if (!rule.id || rule.id.trim().length === 0) {
        errors.push({
          field: `rules[${i}].id`,
          message: 'Rule ID is required',
          code: 'RULE_ID_MISSING',
        });
      }

      if (!rule.sourceDocument || rule.sourceDocument.trim().length === 0) {
        errors.push({
          field: `rules[${i}].sourceDocument`,
          message: 'Rule sourceDocument is required',
          code: 'RULE_SOURCE_DOCUMENT_MISSING',
        });
      }

      if (!rule.extractedAt || !(rule.extractedAt instanceof Date)) {
        errors.push({
          field: `rules[${i}].extractedAt`,
          message: 'Rule extractedAt must be a Date',
          code: 'RULE_EXTRACTED_AT_INVALID',
        });
      }

      // Warnings for optional fields
      if (!rule.identificatie || rule.identificatie.trim().length === 0) {
        warnings.push({
          field: `rules[${i}].identificatie`,
          message: 'Rule identificatie is missing',
          code: 'RULE_IDENTIFICATIE_MISSING',
        });
      }

      if (!rule.content || rule.content.trim().length === 0) {
        warnings.push({
          field: `rules[${i}].content`,
          message: 'Rule content is empty',
          code: 'RULE_CONTENT_EMPTY',
        });
      }
    }
  }

  /**
   * Validate entities
   */
  private validateEntities(
    entities: BaseEntity[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];

      if (!entity.id || entity.id.trim().length === 0) {
        errors.push({
          field: `entities[${i}].id`,
          message: 'Entity ID is required',
          code: 'ENTITY_ID_MISSING',
        });
      }

      if (!entity.type || entity.type.trim().length === 0) {
        errors.push({
          field: `entities[${i}].type`,
          message: 'Entity type is required',
          code: 'ENTITY_TYPE_MISSING',
        });
      }

      if (!entity.name || entity.name.trim().length === 0) {
        errors.push({
          field: `entities[${i}].name`,
          message: 'Entity name is required',
          code: 'ENTITY_NAME_MISSING',
        });
      }
    }
  }

  /**
   * Validate citations
   */
  private validateCitations(
    citations: Citation[],
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    for (let i = 0; i < citations.length; i++) {
      const citation = citations[i];

      if (!citation.id || citation.id.trim().length === 0) {
        errors.push({
          field: `citations[${i}].id`,
          message: 'Citation ID is required',
          code: 'CITATION_ID_MISSING',
        });
      }

      if (!citation.text || citation.text.trim().length === 0) {
        errors.push({
          field: `citations[${i}].text`,
          message: 'Citation text is required',
          code: 'CITATION_TEXT_MISSING',
        });
      }

      if (typeof citation.confidence !== 'number' || citation.confidence < 0 || citation.confidence > 1) {
        errors.push({
          field: `citations[${i}].confidence`,
          message: 'Citation confidence must be a number between 0 and 1',
          code: 'CITATION_CONFIDENCE_INVALID',
        });
      }

      if (!citation.sourceDocument || citation.sourceDocument.trim().length === 0) {
        errors.push({
          field: `citations[${i}].sourceDocument`,
          message: 'Citation sourceDocument is required',
          code: 'CITATION_SOURCE_DOCUMENT_MISSING',
        });
      }

      if (!citation.extractedAt || !(citation.extractedAt instanceof Date)) {
        errors.push({
          field: `citations[${i}].extractedAt`,
          message: 'Citation extractedAt must be a Date',
          code: 'CITATION_EXTRACTED_AT_INVALID',
        });
      }
    }
  }
}
