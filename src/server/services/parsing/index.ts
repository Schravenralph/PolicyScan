/**
 * Parsing Layer
 * 
 * Central export point for the parsing layer.
 * 
 * This layer is responsible for extracting structured information from documents:
 * - Policy rules
 * - Entities (regulations, spatial units, land uses, etc.)
 * - Citations
 * - Metadata
 */

// Main orchestrator
export { PolicyParser } from './PolicyParser.js';

// Parsers
export { XmlPolicyParser } from './parsers/XmlPolicyParser.js';

// Extractors
export { RuleExtractor } from './extractors/RuleExtractor.js';
export { EntityExtractor } from './extractors/EntityExtractor.js';
export { RuleBasedEntityExtractor } from './extractors/RuleBasedEntityExtractor.js';
export { CitationExtractor } from './extractors/CitationExtractor.js';

// Interfaces
export type { IParsingService } from './interfaces/IParsingService.js';
export type { IParser } from './interfaces/IParser.js';
export type { IExtractor } from './interfaces/IExtractor.js';

// Types
export type { ParsedDocument } from './types/ParsedDocument.js';
export type { PolicyRule } from './types/PolicyRule.js';
export type { Citation } from './types/Citation.js';
export type { ExtractionResult } from './types/ExtractionResult.js';
// Re-export NormalizedDocument from shared types (parsing layer uses ingestion layer's normalized documents)
export type { NormalizedDocument } from '../shared/types/DocumentModels.js';

// Validators
export { ParsedDocumentValidator } from './validators/ParsedDocumentValidator.js';
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationOptions,
} from './validators/ParsedDocumentValidator.js';
