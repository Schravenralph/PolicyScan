/**
 * Parsing Actions
 * 
 * Workflow actions for the parsing layer.
 * These actions coordinate document parsing and extraction.
 */

import type { StepAction } from '../../../services/workflow/WorkflowActionRegistry.js';
import type { PolicyParser } from '../../parsing/PolicyParser.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { ParsedDocument } from '../../parsing/types/ParsedDocument.js';
import type { NormalizedDocument } from '../../shared/types/DocumentModels.js';
import type { DocumentSource } from '../../../contracts/types.js';
import { DocumentMapper } from '../mappers/DocumentMapper.js';
import { logger } from '../../../utils/logger.js';

/**
 * Convert Record<string, unknown> to NormalizedDocument
 * This is a helper for converting generic objects to the shared NormalizedDocument contract
 * before using DocumentMapper for conversion to CanonicalDocument
 */
function recordToNormalizedDocument(doc: Record<string, unknown>): NormalizedDocument {
  return {
    sourceId: (doc.sourceId as string) || '',
    sourceUrl: (doc.sourceUrl as string) || '',
    source: (doc.source as DocumentSource) || 'UNKNOWN' as DocumentSource,
    title: (doc.title as string) || '',
    content: (doc.content as string) || '',
    mimeType: (doc.mimeType as string) || 'application/octet-stream',
    rawData: doc.rawData,
    metadata: (doc.metadata as Record<string, unknown>) || {},
  };
}

/**
 * Create a parsing action that parses normalized documents
 * 
 * @param policyParser - Policy parser instance
 * @returns Workflow action function
 */
export function createParsingAction(
  policyParser: PolicyParser
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const documents = params.documents as Array<Record<string, unknown>>;
      if (!documents || !Array.isArray(documents)) {
        throw new Error('documents array is required for parsing action');
      }

      logger.debug({ documentCount: documents.length, runId }, '[ParsingAction] Starting parsing');

      // Convert Record<string, unknown> → NormalizedDocument → CanonicalDocument
      // All conversions go through DocumentMapper (single conversion point)
      const canonicalDocs: CanonicalDocument[] = documents.map((doc) => {
        const normalized = recordToNormalizedDocument(doc);
        return DocumentMapper.normalizedToCanonical(normalized);
      });

      // Parse all documents in parallel
      const parsed: ParsedDocument[] = await Promise.all(
        canonicalDocs.map((doc) => policyParser.parse(doc))
      );

      logger.debug(
        { inputCount: documents.length, outputCount: parsed.length, runId },
        '[ParsingAction] Parsing completed'
      );

      return {
        parsedDocuments: parsed,
      };
    } catch (error) {
      logger.error({ error, runId }, '[ParsingAction] Parsing failed');
      throw error;
    }
  };
}

/**
 * Create an action that extracts rules from documents
 * 
 * @param policyParser - Policy parser instance
 * @returns Workflow action function
 */
export function createRuleExtractionAction(
  policyParser: PolicyParser
): StepAction {
  return async (params: Record<string, unknown>, runId: string) => {
    try {
      const documents = params.documents as Array<Record<string, unknown>>;
      if (!documents || !Array.isArray(documents)) {
        throw new Error('documents array is required for rule extraction action');
      }

      logger.debug({ documentCount: documents.length, runId }, '[RuleExtractionAction] Starting rule extraction');

      // Convert Record<string, unknown> → NormalizedDocument → CanonicalDocument
      // All conversions go through DocumentMapper (single conversion point)
      const canonicalDocs: CanonicalDocument[] = documents.map((doc) => {
        const normalized = recordToNormalizedDocument(doc);
        return DocumentMapper.normalizedToCanonical(normalized);
      });

      // Extract rules from all documents in parallel
      const rulesResults = await Promise.all(
        canonicalDocs.map((doc) => policyParser.extractRules(doc))
      );

      // Flatten rules array
      const allRules = rulesResults.flat();

      logger.debug(
        { documentCount: documents.length, ruleCount: allRules.length, runId },
        '[RuleExtractionAction] Rule extraction completed'
      );

      return {
        rules: allRules,
      };
    } catch (error) {
      logger.error({ error, runId }, '[RuleExtractionAction] Rule extraction failed');
      throw error;
    }
  };
}
