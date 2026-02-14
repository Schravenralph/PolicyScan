/**
 * RuleExtractor - Extracts policy rules from documents
 * 
 * Extracts policy rules from XML documents (primarily DSO regelsvooriedereen.xml).
 * This extractor handles rule extraction logic that was previously in DsoXmlLinker.
 * 
 * Extracted from DsoXmlLinker to separate parsing concerns.
 */

import { parseStringPromise } from 'xml2js';
import { logger } from '../../../utils/logger.js';
import type { IExtractor } from '../interfaces/IExtractor.js';
import type { CanonicalDocument } from '../../../contracts/types.js';
import type { PolicyRule } from '../types/PolicyRule.js';
import { DocumentMapper } from '../../../services/orchestration/mappers/DocumentMapper.js';

/**
 * Rule Extractor
 * 
 * Extracts policy rules from canonical documents.
 * Currently supports XML documents (DSO regelsvooriedereen.xml).
 */
export class RuleExtractor implements IExtractor<PolicyRule> {
  /**
   * Extract policy rules from a document
   * 
   * @param document - Canonical document to extract rules from
   * @returns Array of extracted policy rules
   */
  async extract(document: CanonicalDocument): Promise<PolicyRule[]> {
    logger.debug(
      { sourceId: document.sourceId, source: document.source },
      '[RuleExtractor] Extracting rules from document'
    );

    // Extract rules from XML content
    const rules = await this.extractFromXml(document);
    
    logger.info(
      { sourceId: document.sourceId, ruleCount: rules.length },
      '[RuleExtractor] Extracted rules from document'
    );

    return rules;
  }

  /**
   * Extract rules from XML document
   * 
   * @param document - Canonical document
   * @returns Array of extracted rules
   */
  private async extractFromXml(document: CanonicalDocument): Promise<PolicyRule[]> {
    // First, try to extract from linkedXmlData (if rules were already extracted by DsoXmlLinker)
    const linkedRules = this.extractFromLinkedData(document);
    if (linkedRules.length > 0) {
      logger.debug(
        { sourceId: document.sourceId, ruleCount: linkedRules.length },
        '[RuleExtractor] Extracted rules from linkedXmlData'
      );
      return linkedRules;
    }

    // Try to find regelsvooriedereen.xml in document metadata
    const rulesXmlContent = this.findRulesXmlContent(document);
    
    if (!rulesXmlContent) {
      logger.debug(
        { sourceId: document.sourceId },
        '[RuleExtractor] No regelsvooriedereen.xml found in document'
      );
      return [];
    }

    // Parse XML
    let parsed: unknown;
    try {
      parsed = await parseStringPromise(rulesXmlContent, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        normalize: true,
      });
    } catch (error) {
      logger.error(
        { error, sourceId: document.sourceId },
        '[RuleExtractor] Failed to parse XML content'
      );
      return [];
    }

    // Extract rules array from parsed XML
    const regels = this.extractRulesArray(parsed);
    
    if (regels.length === 0) {
      logger.debug(
        { sourceId: document.sourceId },
        '[RuleExtractor] No rules found in XML'
      );
      return [];
    }

    // Convert to PolicyRule[]
    const rules: PolicyRule[] = regels
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map((r): PolicyRule | null => {
        // Only use fallback ID if no identificatie or id is found
        const rawIdentificatie = r['identificatie'] || r['id'];
        if (!rawIdentificatie) {
          return null; // Skip rules without identifiers
        }
        
        const identificatie = String(rawIdentificatie);
        const id = `${document.sourceId}:${identificatie}`;
        
        return {
          id,
          identificatie,
          titel: r['titel'] || r['title'] ? String(r['titel'] || r['title']) : undefined,
          type: r['type'] || r['soort'] ? String(r['type'] || r['soort']) : undefined,
          content: r['tekst'] || r['text'] || r['inhoud'] ? String(r['tekst'] || r['text'] || r['inhoud']) : undefined,
          sourceDocument: document.sourceId,
          extractedAt: new Date(),
        };
      })
      .filter((r): r is PolicyRule => r !== null); // Filter out nulls (rules without identifiers)

    return rules;
  }

  /**
   * Find regelsvooriedereen.xml content in document
   * 
   * @param document - Normalized document
   * @returns XML content as string, or null if not found
   */
  private findRulesXmlContent(document: CanonicalDocument): string | null {
    // Check enrichmentMetadata for XML metadata (DSO case)
    if (document.enrichmentMetadata && typeof document.enrichmentMetadata === 'object') {
      const enrichment = document.enrichmentMetadata as Record<string, unknown>;
      
      // Check for xmlMetadata array
      if (enrichment.xmlMetadata && Array.isArray(enrichment.xmlMetadata)) {
        const xmlMetadata = enrichment.xmlMetadata as Array<{ filename: string; metadata?: unknown }>;
        const rulesFile = xmlMetadata.find(f =>
          f.filename.toLowerCase().includes('regelsvooriedereen.xml')
        );
        
        // If we have the parsed metadata, we can reconstruct basic rule info
        // But we don't have the raw XML content here
        // For now, we'll need to extract from the metadata structure
        if (rulesFile && rulesFile.metadata) {
          // We have rule summaries, but not full XML content
          // This is a limitation - we'd need access to raw XML files
          // For now, return null and handle this case separately
          return null;
        }
      }

      // Check for linkedXmlData (from DsoXmlLinker)
      if (enrichment.linkedXmlData && typeof enrichment.linkedXmlData === 'object') {
        const linkedData = enrichment.linkedXmlData as Record<string, unknown>;
        if (linkedData.rules && Array.isArray(linkedData.rules)) {
          // We have linked rules data, but not raw XML
          // This means rules were already extracted by DsoXmlLinker
          // We can convert them to PolicyRule format
          return null; // Signal to use linkedXmlData instead
        }
      }
    }

    // Check sourceMetadata for XML files
    if (document.sourceMetadata && typeof document.sourceMetadata === 'object') {
      const metadata = document.sourceMetadata as Record<string, unknown>;
      
      // Check for XML content
      if (metadata.xmlContent && typeof metadata.xmlContent === 'string') {
        // Check if this is regelsvooriedereen.xml
        if (metadata.xmlFilename && 
            typeof metadata.xmlFilename === 'string' &&
            metadata.xmlFilename.toLowerCase().includes('regelsvooriedereen.xml')) {
          return metadata.xmlContent as string;
        }
      }
    }

    // Extract parsing fields
    const parsingFields = DocumentMapper.extractParsingFields(document);

    // Check rawData if it's XML
    if (parsingFields.rawData && typeof parsingFields.rawData === 'string') {
      const trimmed = parsingFields.rawData.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
        // Check if this looks like regelsvooriedereen.xml
        if (trimmed.toLowerCase().includes('regelsvooriedereen') || 
            trimmed.toLowerCase().includes('regels')) {
          return trimmed;
        }
      }
    }

    return null;
  }

  /**
   * Extract rules array from parsed XML
   * 
   * @param parsed - Parsed XML object
   * @returns Array of rule objects
   */
  private extractRulesArray(parsed: unknown): unknown[] {
    if (typeof parsed !== 'object' || parsed === null) {
      return [];
    }

    const obj = parsed as Record<string, unknown>;
    let regels: unknown[] = [];

    // xml2js creates nested structures based on XML element names
    // Try various XML structures and paths
    
    // 1. Direct array
    if (Array.isArray(obj)) {
      regels = obj;
    }
    // 2. Root element contains regels/regel directly
    else if (obj['regels'] || obj['Regels'] || obj['regelsVoorIedereen'] || obj['regelsvooriedereen']) {
      const rules = obj['regels'] || obj['Regels'] || obj['regelsVoorIedereen'] || obj['regelsvooriedereen'];
      if (Array.isArray(rules)) {
        regels = rules;
      } else if (rules && typeof rules === 'object') {
        // Check if it contains 'regel' array or single regel
        const rulesObj = rules as Record<string, unknown>;
        if (rulesObj['regel']) {
          const regel = rulesObj['regel'];
          regels = Array.isArray(regel) ? regel : [regel];
        } else {
          // Might be a single rule object
          regels = [rules];
        }
      } else {
        regels = [rules];
      }
    }
    // 3. Root element contains 'regel' directly
    else if (obj['regel']) {
      const regel = obj['regel'];
      regels = Array.isArray(regel) ? regel : [regel];
    }
    // 4. Search recursively for nested structures
    else {
      const findRegels = (current: unknown, depth = 0): unknown[] => {
        if (depth > 3) return []; // Prevent infinite recursion
        if (typeof current !== 'object' || current === null) return [];
        
        const currentObj = current as Record<string, unknown>;
        
        // Check for regel array directly
        if (currentObj['regel']) {
          const regel = currentObj['regel'];
          return Array.isArray(regel) ? regel : [regel];
        }
        
        // Check for regels container
        if (currentObj['regels'] || currentObj['Regels']) {
          const rules = currentObj['regels'] || currentObj['Regels'];
          if (Array.isArray(rules)) {
            return rules;
          } else if (rules && typeof rules === 'object') {
            return findRegels(rules, depth + 1);
          }
        }
        
        // Recursively search child objects
        for (const value of Object.values(currentObj)) {
          const found = findRegels(value, depth + 1);
          if (found.length > 0) {
            return found;
          }
        }
        
        return [];
      };
      
      regels = findRegels(obj);
    }

    return regels;
  }

  /**
   * Extract rules from linkedXmlData (when XML content is not available)
   * 
   * This is a fallback when rules were already extracted by DsoXmlLinker
   * and stored in enrichmentMetadata.linkedXmlData.
   * 
   * @param document - Normalized document
   * @returns Array of extracted rules
   */
  private extractFromLinkedData(document: CanonicalDocument): PolicyRule[] {
    if (!document.enrichmentMetadata || typeof document.enrichmentMetadata !== 'object') {
      return [];
    }

    const enrichment = document.enrichmentMetadata as Record<string, unknown>;
    const linkedData = enrichment.linkedXmlData as Record<string, unknown> | undefined;

    if (!linkedData || !linkedData.rules || !Array.isArray(linkedData.rules)) {
      return [];
    }

    const linkedRules = linkedData.rules as Array<{
      identificatie: string;
      titel?: string;
      type?: string;
      hasTekst?: boolean;
    }>;

    return linkedRules.map((r) => {
      const id = `${document.sourceId}:${r.identificatie}`;
      
      return {
        id,
        identificatie: r.identificatie,
        titel: r.titel,
        type: r.type,
        sourceDocument: document.sourceId,
        extractedAt: new Date(),
      };
    });
  }
}
