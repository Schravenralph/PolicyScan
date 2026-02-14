/**
 * EuroVoc Mapper
 * Maps knowledge graph entities to EuroVoc (European vocabulary) concepts
 * 
 * EuroVoc is a multilingual thesaurus maintained by the EU Publications Office.
 * It provides standardized terminology for EU policy domains.
 */

import { BaseEntity } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';
import axios from 'axios';

export interface EuroVocConcept {
  id: string;
  label: string;
  language: string;
  uri?: string;
  broaderConcepts?: string[];
  relatedConcepts?: string[];
}

export interface EuroVocAlignment {
  entityId: string;
  euroVocConceptId: string;
  euroVocLabel: string;
  language: string;
  confidence: number;
  alignmentMethod: 'exact' | 'fuzzy' | 'semantic';
  createdAt: Date;
}

export interface EuroVocAlignmentResult {
  alignments: EuroVocAlignment[];
  totalEntities: number;
  alignedEntities: number;
  averageConfidence: number;
}

/**
 * Service for mapping entities to EuroVoc concepts
 * 
 * Note: This is a simplified implementation. In production, you would:
 * 1. Load EuroVoc thesaurus data (RDF/SKOS format)
 * 2. Use a proper SPARQL endpoint or local database
 * 3. Implement semantic matching using embeddings
 */
export class EuroVocMapper {
  private readonly MIN_CONFIDENCE = 0.6;
  private readonly EUROVOC_API_BASE = 'https://publications.europa.eu/webapi/rdf/sparql';
  private conceptCache: Map<string, EuroVocConcept[]> = new Map();
  private readonly SUPPORTED_LANGUAGES = ['nl', 'en']; // Dutch and English

  /**
   * Map a single entity to EuroVoc concepts
   */
  async mapEntity(entity: BaseEntity): Promise<EuroVocAlignment[]> {
    const alignments: EuroVocAlignment[] = [];

    if (!entity.name) {
      return alignments;
    }

    // Try to find EuroVoc concepts for the entity name
    // This is a simplified implementation - in production, use proper EuroVoc API or local database
    try {
      const concepts = await this.findEuroVocConcepts(entity.name, 'nl'); // Start with Dutch

      for (const concept of concepts) {
        const confidence = this.calculateConfidence(entity.name, concept.label);
        
        if (confidence >= this.MIN_CONFIDENCE) {
          alignments.push({
            entityId: entity.id,
            euroVocConceptId: concept.id,
            euroVocLabel: concept.label,
            language: concept.language,
            confidence,
            alignmentMethod: confidence >= 0.9 ? 'exact' : confidence >= 0.75 ? 'fuzzy' : 'semantic',
            createdAt: new Date(),
          });
        }
      }

      // Also try English if Dutch didn't yield good results
      if (alignments.length === 0) {
        const enConcepts = await this.findEuroVocConcepts(entity.name, 'en');
        for (const concept of enConcepts) {
          const confidence = this.calculateConfidence(entity.name, concept.label);
          if (confidence >= this.MIN_CONFIDENCE) {
            alignments.push({
              entityId: entity.id,
              euroVocConceptId: concept.id,
              euroVocLabel: concept.label,
              language: concept.language,
              confidence,
              alignmentMethod: confidence >= 0.9 ? 'exact' : confidence >= 0.75 ? 'fuzzy' : 'semantic',
              createdAt: new Date(),
            });
          }
        }
      }
    } catch (error) {
      logger.warn({ error, entityId: entity.id }, `[EuroVocMapper] Error mapping entity ${entity.id}`);
      // Fallback to keyword-based matching
      return this.fallbackMapping(entity);
    }

    return alignments;
  }

  /**
   * Find EuroVoc concepts matching a term
   * 
   * Note: This is a placeholder implementation. In production, you would:
   * 1. Query EuroVoc SPARQL endpoint
   * 2. Use a local EuroVoc database
   * 3. Use semantic search with embeddings
   */
  private async findEuroVocConcepts(term: string, language: string): Promise<EuroVocConcept[]> {
    // Validate language to prevent injection
    if (!this.SUPPORTED_LANGUAGES.includes(language)) {
      logger.warn({ language }, `[EuroVocMapper] Unsupported language '${language}', defaulting to 'nl'`);
      language = 'nl';
    }

    // Check cache first
    const cacheKey = `${term.toLowerCase()}_${language}`;
    if (this.conceptCache.has(cacheKey)) {
      return this.conceptCache.get(cacheKey)!;
    }

    // Query EuroVoc SPARQL endpoint
    const concepts: EuroVocConcept[] = [];
    
    // Escape the term to prevent SPARQL injection (basic)
    // First escape backslashes, then double quotes
    const sanitizedTerm = term
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    // SPARQL query to find concepts by label
    const query = `
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      SELECT ?concept ?label WHERE {
        ?concept skos:prefLabel ?label .
        FILTER (lang(?label) = "${language}")
        FILTER (contains(lcase(?label), lcase("${sanitizedTerm}")))
      }
      LIMIT 10
    `;

    try {
      const response = await axios.get(this.EUROVOC_API_BASE, {
        params: { query },
        headers: {
          'Accept': 'application/sparql-results+json'
        },
        timeout: 5000 // 5 seconds timeout
      });

      if (response.data && response.data.results && response.data.results.bindings) {
        for (const binding of response.data.results.bindings) {
          if (binding.concept && binding.label) {
            concepts.push({
              id: binding.concept.value,
              label: binding.label.value,
              language: binding.label['xml:lang'] || language,
              uri: binding.concept.value
            });
          }
        }
      }
    } catch (error) {
      logger.error({ error, term, language }, '[EuroVocMapper] Error querying EuroVoc API');
      throw error;
    }

    this.conceptCache.set(cacheKey, concepts);
    return concepts;
  }

  /**
   * Fallback mapping using keyword matching
   */
  private fallbackMapping(entity: BaseEntity): EuroVocAlignment[] {
    // Simple keyword-based mapping for common policy terms
    // This is a placeholder - in production, use proper EuroVoc integration
    
    const commonTerms: Record<string, string> = {
      'water': '100277', // Water management (example ID)
      'milieu': '100142', // Environment
      'ruimtelijke ordening': '100277', // Spatial planning
      'verkeer': '100277', // Traffic
      'wonen': '100277', // Housing
    };

    const alignments: EuroVocAlignment[] = [];
    const entityNameLower = entity.name.toLowerCase();

    for (const [term, conceptId] of Object.entries(commonTerms)) {
      if (entityNameLower.includes(term)) {
        alignments.push({
          entityId: entity.id,
          euroVocConceptId: conceptId,
          euroVocLabel: term,
          language: 'nl',
          confidence: 0.7, // Moderate confidence for keyword matching
          alignmentMethod: 'fuzzy',
          createdAt: new Date(),
        });
      }
    }

    return alignments;
  }

  /**
   * Calculate confidence score between entity name and EuroVoc label
   */
  private calculateConfidence(entityName: string, euroVocLabel: string): number {
    const nameLower = entityName.toLowerCase().trim();
    const labelLower = euroVocLabel.toLowerCase().trim();

    // Exact match
    if (nameLower === labelLower) {
      return 1.0;
    }

    // Contains match
    if (nameLower.includes(labelLower) || labelLower.includes(nameLower)) {
      return 0.85;
    }

    // Word-based similarity
    const nameWords = nameLower.split(/\s+/);
    const labelWords = labelLower.split(/\s+/);
    let matchingWords = 0;

    for (const nameWord of nameWords) {
      if (nameWord.length > 3) { // Ignore short words
        for (const labelWord of labelWords) {
          if (nameWord === labelWord) {
            matchingWords++;
            break;
          } else if (nameWord.includes(labelWord) || labelWord.includes(nameWord)) {
            matchingWords += 0.5;
            break;
          }
        }
      }
    }

    if (matchingWords > 0) {
      return Math.min(0.8, matchingWords / Math.max(nameWords.length, labelWords.length));
    }

    // Character-based similarity (simple Levenshtein approximation)
    return this.simpleSimilarity(nameLower, labelLower);
  }

  /**
   * Simple string similarity calculation
   */
  private simpleSimilarity(s1: string, s2: string): number {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;

    let matches = 0;
    const minLen = Math.min(s1.length, s2.length);
    for (let i = 0; i < minLen; i++) {
      if (s1[i] === s2[i]) matches++;
    }

    return matches / maxLen;
  }

  /**
   * Map multiple entities to EuroVoc concepts
   */
  async mapEntities(entities: BaseEntity[]): Promise<EuroVocAlignmentResult> {
    const allAlignments: EuroVocAlignment[] = [];
    let totalConfidence = 0;
    let alignedCount = 0;

    for (const entity of entities) {
      const alignments = await this.mapEntity(entity);
      
      if (alignments.length > 0) {
        allAlignments.push(...alignments);
        alignedCount++;
        totalConfidence += alignments.reduce((sum, a) => sum + a.confidence, 0) / alignments.length;
      }
    }

    const averageConfidence = alignedCount > 0 ? totalConfidence / alignedCount : 0;

    return {
      alignments: allAlignments,
      totalEntities: entities.length,
      alignedEntities: alignedCount,
      averageConfidence,
    };
  }

  /**
   * Get EuroVoc terms for a specific entity
   */
  async getEuroVocTerms(entityId: string, entity: BaseEntity): Promise<string[]> {
    const alignments = await this.mapEntity(entity);
    return alignments.map(a => a.euroVocLabel);
  }

  /**
   * Validate alignment quality
   */
  validateAlignment(alignment: EuroVocAlignment): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (alignment.confidence < this.MIN_CONFIDENCE) {
      issues.push(`Confidence ${alignment.confidence} below minimum threshold ${this.MIN_CONFIDENCE}`);
    }

    if (!alignment.euroVocConceptId || !alignment.euroVocLabel) {
      issues.push('Missing EuroVoc concept ID or label');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Generate alignment report
   */
  async generateAlignmentReport(entities: BaseEntity[]): Promise<{
    totalEntities: number;
    alignedEntities: number;
    alignmentRate: number;
    averageConfidence: number;
    alignmentsByMethod: Record<string, number>;
    alignmentsByLanguage: Record<string, number>;
  }> {
    const result = await this.mapEntities(entities);

    const alignmentsByMethod: Record<string, number> = {
      exact: 0,
      fuzzy: 0,
      semantic: 0,
    };

    const alignmentsByLanguage: Record<string, number> = {};

    for (const alignment of result.alignments) {
      alignmentsByMethod[alignment.alignmentMethod] = (alignmentsByMethod[alignment.alignmentMethod] || 0) + 1;
      alignmentsByLanguage[alignment.language] = (alignmentsByLanguage[alignment.language] || 0) + 1;
    }

    return {
      totalEntities: result.totalEntities,
      alignedEntities: result.alignedEntities,
      alignmentRate: result.totalEntities > 0 ? result.alignedEntities / result.totalEntities : 0,
      averageConfidence: result.averageConfidence,
      alignmentsByMethod,
      alignmentsByLanguage,
    };
  }
}
