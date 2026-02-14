/**
 * ImroExtractor - Extract text and metadata from IMRO GML
 * 
 * Parses IMRO GML files (IMRO2008 schema) and extracts:
 * - Text content from planteksten, regels, toelichting
 * - Metadata (title, dates, publisher, type, etc.)
 * - Geometry information (for GeoExtension)
 * 
 * Homologous structure to StopTpodExtractor - parser only, no database loading.
 * 
 * @see docs/30-dso-ruimtelijke-plannen/ for IMRO GML structure
 */

import { parseStringPromise } from 'xml2js';
import { logger } from '../../utils/logger.js';

/**
 * Extracted text and metadata from IMRO GML
 * 
 * Homologous to StopTpodExtractionResult for consistency.
 */
export interface ImroExtractionResult {
  fullText: string;
  metadata?: {
    title?: string;
    bestuursorgaan?: string;
    documentType?: string;
    identificatie?: string;
    publicatiedatum?: string;
    geldigheidsdatum?: string;
    typePlan?: string;
    naamOverheid?: string;
  };
}


/**
 * ImroExtractor - Extract text and metadata from IMRO GML
 * 
 * Homologous to StopTpodExtractor - only parses, does not load to database.
 */
export class ImroExtractor {
  /**
   * Extract text and metadata from IMRO GML
   * 
   * @param gmlContent - IMRO GML content as string or Buffer
   * @returns Extracted text and metadata
   */
  async extract(gmlContent: string | Buffer): Promise<ImroExtractionResult> {
    const gmlString = typeof gmlContent === 'string' ? gmlContent : gmlContent.toString('utf-8');
    
    try {
      // Parse GML as XML
      const parsed = await parseStringPromise(gmlString, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        normalize: true,
      });

      // Extract text content from IMRO structure
      const fullText = this.extractText(parsed);
      
      // Extract metadata from IMRO structure
      const metadata = this.extractMetadata(parsed);

      logger.debug(
        { 
          textLength: fullText.length,
          hasTitle: !!metadata?.title,
          documentType: metadata?.documentType,
          identificatie: metadata?.identificatie,
        },
        'Extracted text and metadata from IMRO GML'
      );

      return {
        fullText: fullText || 'No text content found in IMRO GML',
        metadata,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to extract text from IMRO GML');
      throw new Error(`IMRO extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract text content from parsed IMRO GML object
   * 
   * IMRO GML structure:
   * - imro:FeatureCollectionIMRO (root)
   *   - imro:featureMember[]
   *     - imro:MetadataIMRObestand (metadata - skip from text, use metadata extraction)
   *     - imro:Besluitgebied_X (decision area with geometry)
   *     - imro:Bestemmingsvlak (destination area)
   *     - imro:Plantekst (plan text)
   *     - imro:Regeltekst (rule text)
   *     - imro:Toelichting (explanation)
   */
  private extractText(obj: unknown): string {
    if (typeof obj === 'string') {
      // Filter out technical metadata strings
      return this.filterTechnicalContent(obj);
    }

    if (typeof obj !== 'object' || obj === null) {
      return '';
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.extractText(item)).filter(t => t.trim().length > 0).join('\n\n');
    }

    const parts: string[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      // Skip attributes, namespaces, and metadata-only elements
      if (key.startsWith('_') || key === '$' || key.startsWith('xmlns')) {
        continue;
      }

      // Skip technical/structural elements that shouldn't appear in user-facing text
      if (this.isTechnicalElement(key)) {
        continue;
      }

      // Skip metadata-only containers - metadata is extracted separately
      if (this.isMetadataContainer(key)) {
        continue;
      }

      // Extract text from IMRO-specific elements
      const text = this.extractText(value);
      if (text.trim().length > 0) {
        // Add heading markers for important IMRO elements
        if (this.isHeadingElement(key)) {
          parts.push(`\n## ${this.getHeadingLabel(key)}\n${text}\n`);
        } else if (this.isTextElement(key)) {
          // Plantekst, Regeltekst, Toelichting - these are main content
          parts.push(`\n### ${this.getTextElementLabel(key)}\n${text}\n`);
        } else {
          parts.push(text);
        }
      }
    }

    const extracted = parts.join('\n\n');
    
    // Skip leading technical metadata blocks before returning
    return this.skipLeadingTechnicalMetadata(extracted);
  }

  /**
   * Skip leading technical metadata blocks from extracted text
   * Removes lines at the start that contain only technical content
   * 
   * @param text - Text that may have leading technical metadata
   * @returns Text with leading technical metadata removed
   */
  private skipLeadingTechnicalMetadata(text: string): string {
    const lines = text.split('\n');
    let startIndex = 0;
    
    // Find the first line that contains meaningful content (not just technical metadata)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) {
        continue;
      }
      
      // Check if this line is technical content
      const filtered = this.filterTechnicalContent(line);
      
      // If the line was filtered out completely, it's technical - skip it
      if (!filtered || filtered.trim().length === 0) {
        continue;
      }
      
      // If the line is very short (likely still technical), skip it
      if (line.length < 10) {
        continue;
      }
      
      // Found first meaningful line
      startIndex = i;
      break;
    }
    
    // Return text starting from first meaningful content
    return lines.slice(startIndex).join('\n').trim();
  }

  /**
   * Filter out technical content from strings (URLs, schema references, technical identifiers)
   */
  private filterTechnicalContent(text: string): string {
    const trimmed = text.trim();
    
    // Filter out URLs
    if (/^https?:\/\//.test(trimmed)) {
      return '';
    }

    // Filter out schema references (both schemas.geonovum.nl and www.geonovum.nl)
    if (/^http:\/\/schemas\.geonovum\.nl\//.test(trimmed) || 
        /^http:\/\/www\.geonovum\.nl\//.test(trimmed)) {
      return '';
    }

    // Filter out "Collectie" lines with technical metadata (e.g., "Collectie http://www.geonovum.nl/...")
    if (/^Collectie\s+http/i.test(trimmed)) {
      return '';
    }

    // Filter out technical identifiers like NL.IMRO.* (expanded pattern)
    if (/^NL\.IMRO\./i.test(trimmed)) {
      return '';
    }

    // Filter out namespace declarations
    if (/^xmlns:/.test(trimmed)) {
      return '';
    }

    // Filter out CRS/coordinate system references
    if (/^urn:ogc:def:crs:EPSG:/.test(trimmed)) {
      return '';
    }

    // Filter out "NedPlan" version strings (e.g., "NedPlan 2.0", "NedPlan 1.1.0")
    if (/^NedPlan\s+[\d.]+$/i.test(trimmed)) {
      return '';
    }

    // Filter out pure coordinate strings (just numbers and spaces/dots)
    // This catches coordinate pairs like "182376 547324" or "104364.728 494223.326"
    if (/^\d+[\s\d\.]+$/.test(trimmed) && trimmed.split(/\s+/).length >= 2) {
      return '';
    }

    return text;
  }

  /**
   * Check if element is technical/structural and should be excluded from user-facing text
   */
  private isTechnicalElement(elementName: string): boolean {
    const technicalPatterns = [
      /^FeatureCollectionIMRO$/i,
      /^featureCollection$/i,
      /^boundedBy$/i,
      /^Envelope$/i,
      /^lowerCorner$/i,
      /^upperCorner$/i,
      /^srsName$/i,
      /^codeReferentiesysteem$/i,
      /^gml:id$/i,
      /^gml:name$/i,
      /^gml:description$/i,
      /^xsi:schemaLocation$/i,
      /^xmlns:/i,
    ];
    
    return technicalPatterns.some(pattern => pattern.test(elementName));
  }

  /**
   * Check if element is a metadata container that should be excluded from text extraction
   * (metadata is extracted separately via extractMetadata)
   */
  private isMetadataContainer(elementName: string): boolean {
    const metadataPatterns = [
      /^MetadataIMRObestand$/i,
      /^Metadata$/i,
      /^metadata$/i,
    ];
    
    return metadataPatterns.some(pattern => pattern.test(elementName));
  }

  /**
   * Check if element name suggests a heading
   */
  private isHeadingElement(elementName: string): boolean {
    const headingPatterns = [
      /^titel$/i,
      /^naam$/i,
      /^datasetTitel$/i,
      /^identificatie$/i,
      /^typePlan$/i,
      /^besluitgebied$/i,
      /^bestemmingsvlak$/i,
    ];
    
    return headingPatterns.some(pattern => pattern.test(elementName));
  }

  /**
   * Check if element contains main text content
   */
  private isTextElement(elementName: string): boolean {
    const textPatterns = [
      /^plantekst$/i,
      /^regeltekst$/i,
      /^toelichting$/i,
      /^tekst$/i,
      /^beschrijving$/i,
      /^description$/i,
    ];
    
    return textPatterns.some(pattern => pattern.test(elementName));
  }

  /**
   * Get human-readable label for heading element
   */
  private getHeadingLabel(elementName: string): string {
    const labels: Record<string, string> = {
      'titel': 'Titel',
      'naam': 'Naam',
      'datasetTitel': 'Dataset Titel',
      'identificatie': 'Identificatie',
      'typePlan': 'Type Plan',
      'besluitgebied': 'Besluitgebied',
      'bestemmingsvlak': 'Bestemmingsvlak',
    };
    
    return labels[elementName] || elementName;
  }

  /**
   * Get human-readable label for text element
   */
  private getTextElementLabel(elementName: string): string {
    const labels: Record<string, string> = {
      'plantekst': 'Plantekst',
      'regeltekst': 'Regeltekst',
      'toelichting': 'Toelichting',
      'tekst': 'Tekst',
      'beschrijving': 'Beschrijving',
      'description': 'Beschrijving',
    };
    
    return labels[elementName] || elementName;
  }

  /**
   * Extract metadata from parsed IMRO GML
   * 
   * IMRO GML metadata structure:
   * - imro:MetadataIMRObestand
   *   - imro:datasetTitel
   *   - imro:creatiedatum
   *   - imro:bronbeheerder
   *   - imro:codeReferentiesysteem
   * - imro:Besluitgebied_X
   *   - imro:identificatie
   *   - imro:typePlan
   *   - imro:naamOverheid
   *   - imro:beleidsmatigVerantwoordelijkeOverheid
   */
  private extractMetadata(parsed: unknown): ImroExtractionResult['metadata'] {
    const metadata: ImroExtractionResult['metadata'] = {};

    if (typeof parsed !== 'object' || parsed === null) {
      return metadata;
    }

    const obj = parsed as Record<string, unknown>;

    // Find FeatureCollectionIMRO root
    const featureCollection = this.findValue(obj, [
      'imro:FeatureCollectionIMRO',
      'FeatureCollectionIMRO',
      'FeatureCollection',
    ]);

    if (!featureCollection || typeof featureCollection !== 'object') {
      return metadata;
    }

    const fc = featureCollection as Record<string, unknown>;

    // Extract from MetadataIMRObestand
    const metadataElement = this.findValue(fc, [
      'imro:MetadataIMRObestand',
      'MetadataIMRObestand',
      'Metadata',
    ]);

    if (metadataElement && typeof metadataElement === 'object') {
      const meta = metadataElement as Record<string, unknown>;
      
      // Dataset title
      const datasetTitel = this.findValue(meta, ['imro:datasetTitel', 'datasetTitel', 'titel', 'title']);
      if (datasetTitel) {
        metadata.title = String(datasetTitel);
      }

      // Creation date
      const creatiedatum = this.findValue(meta, ['imro:creatiedatum', 'creatiedatum', 'createdAt']);
      if (creatiedatum) {
        metadata.publicatiedatum = String(creatiedatum);
      }

      // Source manager (bronbeheerder)
      const bronbeheerder = this.findValue(meta, ['imro:bronbeheerder', 'bronbeheerder', 'publisher']);
      if (bronbeheerder) {
        metadata.bestuursorgaan = String(bronbeheerder);
      }
    }

    // Extract from featureMember array (Besluitgebied_X, etc.)
    const featureMembers = this.findValue(fc, [
      'imro:featureMember',
      'featureMember',
      'featureMembers',
    ]);

    if (Array.isArray(featureMembers)) {
      for (const member of featureMembers) {
        if (typeof member !== 'object' || member === null) {
          continue;
        }

        const memberObj = member as Record<string, unknown>;

        // Besluitgebied_X (decision area)
        const besluitgebied = this.findValue(memberObj, [
          'imro:Besluitgebied_X',
          'Besluitgebied_X',
          'Besluitgebied',
        ]);

        if (besluitgebied && typeof besluitgebied === 'object') {
          const bg = besluitgebied as Record<string, unknown>;
          
          // Identificatie
          const identificatie = this.findValue(bg, ['imro:identificatie', 'identificatie', 'id']);
          if (identificatie && !metadata.identificatie) {
            metadata.identificatie = String(identificatie);
          }

          // Type plan
          const typePlan = this.findValue(bg, ['imro:typePlan', 'typePlan', 'type']);
          if (typePlan && !metadata.documentType) {
            metadata.documentType = String(typePlan);
            metadata.typePlan = String(typePlan);
          }

          // Government name
          const naamOverheid = this.findValue(bg, [
            'imro:naamOverheid',
            'naamOverheid',
            'overheid',
            'government',
          ]);
          if (naamOverheid && !metadata.bestuursorgaan) {
            metadata.bestuursorgaan = String(naamOverheid);
            metadata.naamOverheid = String(naamOverheid);
          }
        }
      }
    }

    // Extract from gml:name (often contains identificatie)
    const gmlName = this.findValue(fc, ['gml:name', 'name']);
    if (gmlName && !metadata.identificatie) {
      const nameStr = String(gmlName);
      if (nameStr.startsWith('NL.IMRO.')) {
        metadata.identificatie = nameStr;
      }
    }

    return metadata;
  }

  /**
   * Find value by key (case-insensitive, supports nested objects and namespaces)
   */
  private findValue(obj: unknown, keys: string[]): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    for (const key of keys) {
      // Direct match
      if (key in obj) {
        const value = (obj as Record<string, unknown>)[key];
        if (value !== null && value !== undefined) {
          return value;
        }
      }

      // Case-insensitive match
      for (const [objKey, value] of Object.entries(obj)) {
        // Remove namespace prefix for comparison
        const objKeyBase = objKey.includes(':') ? objKey.split(':').pop() : objKey;
        const keyBase = key.includes(':') ? key.split(':').pop() : key;
        
        if (objKeyBase?.toLowerCase() === keyBase?.toLowerCase()) {
          if (value !== null && value !== undefined) {
            return value;
          }
        }
      }
    }

    // Recursive search in nested objects
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const found = this.findValue(value, keys);
        if (found) {
          return found;
        }
      } else if (Array.isArray(value)) {
        // Search in array elements
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            const found = this.findValue(item, keys);
            if (found) {
              return found;
            }
          }
        }
      }
    }

    return null;
  }
}
