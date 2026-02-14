/**
 * PolicyParser - Main parsing orchestrator
 * 
 * Coordinates format-specific parsers and extractors to parse documents
 * and extract structured information (rules, entities, citations).
 * 
 * This is the main entry point for the parsing layer.
 */

import { logger } from '../../utils/logger.js';
import { LLMService } from '../llm/LLMService.js';
import { XmlPolicyParser } from './parsers/XmlPolicyParser.js';
import { RuleExtractor } from './extractors/RuleExtractor.js';
import { EntityExtractor } from './extractors/EntityExtractor.js';
import { CitationExtractor } from './extractors/CitationExtractor.js';
import type { IParsingService } from './interfaces/IParsingService.js';
import type { IParser } from './interfaces/IParser.js';
import type { IExtractor } from './interfaces/IExtractor.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import type { ParsedDocument } from './types/ParsedDocument.js';
import type { PolicyRule } from './types/PolicyRule.js';
import type { Citation } from './types/Citation.js';
import type { BaseEntity } from '../../domain/ontology.js';
import { DocumentMapper } from '../orchestration/mappers/DocumentMapper.js';

/**
 * Main parsing orchestrator
 * 
 * Coordinates parsers and extractors to parse documents.
 * 
 * Workflow:
 * 1. Find appropriate parser for document format
 * 2. Parse document structure
 * 3. Extract rules, entities, and citations in parallel
 * 4. Combine results into ParsedDocument
 */
export class PolicyParser implements IParsingService {
  private parsers: IParser[] = [];
  private ruleExtractor: IExtractor<PolicyRule>;
  private entityExtractor: IExtractor<BaseEntity>;
  private citationExtractor: IExtractor<Citation>;

  constructor(llmService?: LLMService) {
    // Register format-specific parsers
    this.parsers = [
      new XmlPolicyParser(),
      // HtmlPolicyParser and TextPolicyParser will be added in future steps
    ];

    // Register extractors
    this.ruleExtractor = new RuleExtractor();
    this.entityExtractor = new EntityExtractor(llmService);
    this.citationExtractor = new CitationExtractor();

    logger.debug(
      {
        parserCount: this.parsers.length,
        extractors: ['RuleExtractor', 'EntityExtractor', 'CitationExtractor'],
      },
      '[PolicyParser] Initialized with parsers and extractors'
    );
  }

  /**
   * Parse a canonical document and extract all structured information
   * 
   * @param document - Canonical document to parse
   * @returns Parsed document with rules, entities, and citations
   */
  async parse(document: CanonicalDocument): Promise<ParsedDocument> {
    logger.debug(
      { sourceId: document.sourceId, source: document.source },
      '[PolicyParser] Starting parse workflow'
    );

    const startTime = Date.now();

    // Extract parsing fields from CanonicalDocument
    const parsingFields = DocumentMapper.extractParsingFields(document);

    // Step 1: Find appropriate parser for document format
    const parser = this.findParser(document);
    if (!parser) {
      throw new Error(
        `No parser found for document: ${document.sourceId} (source: ${document.source}, mimeType: ${parsingFields.mimeType || 'unknown'})`
      );
    }

    logger.debug(
      { sourceId: document.sourceId, parserType: parser.constructor.name },
      '[PolicyParser] Found parser for document'
    );

    // Step 2: Parse document structure
    const parsedDocument = await parser.parse(document);

    logger.debug(
      {
        sourceId: document.sourceId,
        title: parsedDocument.title,
        documentType: parsedDocument.documentType,
      },
      '[PolicyParser] Parsed document structure'
    );

    // Step 3: Extract rules, entities, and citations in parallel
    // Extractors also accept CanonicalDocument now
    const [rules, entities, citations] = await Promise.all([
      this.ruleExtractor.extract(document),
      this.entityExtractor.extract(document),
      this.citationExtractor.extract(document),
    ]);

    logger.debug(
      {
        sourceId: document.sourceId,
        rulesCount: rules.length,
        entitiesCount: entities.length,
        citationsCount: citations.length,
      },
      '[PolicyParser] Extracted rules, entities, and citations'
    );

    // Step 4: Combine results into ParsedDocument
    const finalParsedDocument: ParsedDocument = {
      ...parsedDocument,
      rules,
      entities,
      citations,
    };

    const parseTime = Date.now() - startTime;

    logger.info(
      {
        sourceId: document.sourceId,
        rulesCount: rules.length,
        entitiesCount: entities.length,
        citationsCount: citations.length,
        parseTime,
      },
      '[PolicyParser] Completed parse workflow'
    );

    return finalParsedDocument;
  }

  /**
   * Extract policy rules from a document
   * 
   * @param document - Canonical document
   * @returns Array of extracted policy rules
   */
  async extractRules(document: CanonicalDocument): Promise<PolicyRule[]> {
    logger.debug(
      { sourceId: document.sourceId },
      '[PolicyParser] Extracting rules'
    );

    return this.ruleExtractor.extract(document);
  }

  /**
   * Extract entities from a document
   * 
   * @param document - Canonical document
   * @returns Array of extracted entities
   */
  async extractEntities(document: CanonicalDocument): Promise<BaseEntity[]> {
    logger.debug(
      { sourceId: document.sourceId },
      '[PolicyParser] Extracting entities'
    );

    return this.entityExtractor.extract(document);
  }

  /**
   * Extract citations from a document
   * 
   * @param document - Canonical document
   * @returns Array of extracted citations
   */
  async extractCitations(document: CanonicalDocument): Promise<Citation[]> {
    logger.debug(
      { sourceId: document.sourceId },
      '[PolicyParser] Extracting citations'
    );

    return this.citationExtractor.extract(document);
  }

  /**
   * Find appropriate parser for document
   * 
   * @param document - Canonical document
   * @returns Parser that can handle the document, or null if none found
   */
  private findParser(document: CanonicalDocument): IParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(document)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Register a new parser
   * 
   * @param parser - Parser to register
   */
  addParser(parser: IParser): void {
    this.parsers.push(parser);
    logger.debug(
      { parserType: parser.constructor.name },
      '[PolicyParser] Registered new parser'
    );
  }

  /**
   * Register a new extractor (for future extensibility)
   * 
   * Note: Currently extractors are fixed, but this allows for future extension
   * 
   * @param extractor - Extractor to register
   * @param type - Type of extractor ('rule' | 'entity' | 'citation')
   */
  setExtractor(
    extractor: IExtractor<PolicyRule> | IExtractor<BaseEntity> | IExtractor<Citation>,
    type: 'rule' | 'entity' | 'citation'
  ): void {
    switch (type) {
      case 'rule':
        this.ruleExtractor = extractor as IExtractor<PolicyRule>;
        break;
      case 'entity':
        this.entityExtractor = extractor as IExtractor<BaseEntity>;
        break;
      case 'citation':
        this.citationExtractor = extractor as IExtractor<Citation>;
        break;
    }
    logger.debug(
      { extractorType: type, extractorClass: extractor.constructor.name },
      '[PolicyParser] Set new extractor'
    );
  }
}
