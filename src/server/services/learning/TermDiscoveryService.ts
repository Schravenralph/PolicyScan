/**
 * Term Discovery Service
 * 
 * Analyzes recent documents to discover new terms, synonyms, and related concepts
 * that can be added to synonym dictionaries. This enables dynamic dictionary updates
 * based on actual document content.
 * 
 * HOW IT WORKS:
 * 1. Analyzes documents from recent workflow runs
 * 2. Extracts terms that co-occur with known query terms
 * 3. Identifies potential synonyms and related terms
 * 4. Suggests additions to synonym dictionaries
 * 
 * TRIGGERING:
 * - Can be called manually via admin interface (future)
 * - Can be scheduled to run periodically
 * - Can be triggered after workflow completion
 * 
 * TESTING:
 * - Unit tests: src/server/services/__tests__/TermDiscoveryService.test.ts
 * - Manual: Call discoverTerms() with test documents and verify suggestions
 */

import { Db } from 'mongodb';
import { getDB } from '../../config/database.js';

export interface DiscoveredTerm {
  term: string;
  frequency: number;
  coOccurrences: string[]; // Terms that appear together
  context: string[]; // Sample contexts where term appears
  confidence: number; // 0-1, based on frequency and co-occurrence patterns
  suggestedDictionary: 'dutch' | 'planning' | 'housing' | 'policy' | 'general';
}

export interface TermDiscoveryResult {
  discoveredTerms: DiscoveredTerm[];
  suggestions: DictionarySuggestion[];
  statistics: {
    documentsAnalyzed: number;
    uniqueTermsFound: number;
    highConfidenceTerms: number;
  };
}

export interface DictionarySuggestion {
  originalTerm: string;
  suggestedSynonyms: string[];
  dictionary: string;
  confidence: number;
  reasoning: string;
}

/**
 * Term Discovery Service
 * 
 * Analyzes documents to discover new terms and suggest dictionary updates.
 */
export class TermDiscoveryService {
  private db: Db;
  private minFrequency: number = 3; // Minimum occurrences to consider a term
  private minConfidence: number = 0.6; // Minimum confidence for suggestions

  constructor(db?: Db) {
    this.db = db || getDB();
  }

  /**
   * Discover new terms from recent documents
   * 
   * Analyzes documents from recent workflow runs to find:
   * - Terms that co-occur with known query terms
   * - Potential synonyms based on context similarity
   * - Related terms that appear in similar documents
   * 
   * @param queryTerms Known query terms to find related terms for
   * @param maxDocuments Maximum number of documents to analyze (default: 100)
   * @param timeWindowDays Number of days to look back (default: 30)
   * @returns Discovered terms and dictionary suggestions
   */
  async discoverTerms(
    queryTerms: string[],
    maxDocuments: number = 100,
    timeWindowDays: number = 30
  ): Promise<TermDiscoveryResult> {
    try {
      // Get recent documents from database
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeWindowDays);

      // Use canonical document service
      // Note: canonical documents use createdAt instead of scrapedAt
      const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
      const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
      const documentService = getCanonicalDocumentService();
      
      // Query canonical documents by date range (using createdAt as proxy for scrapedAt)
      const canonicalDocs = await documentService.findByDateRange(
        cutoffDate,
        new Date(),
        { limit: maxDocuments }
      );
      
      // Transform to legacy format for compatibility
      const documents = transformCanonicalArrayToLegacy(canonicalDocs);

      console.log(`🔍 Analyzing ${documents.length} documents for term discovery...`);

      // Extract terms from documents
      const termFrequencies = new Map<string, number>();
      const termCoOccurrences = new Map<string, Set<string>>();
      const termContexts = new Map<string, string[]>();

      for (const doc of documents) {
        const text = this.extractText(doc as unknown as { titel?: string; samenvatting?: string; content?: string });
        const terms = this.extractTerms(text, queryTerms);

        for (const term of terms) {
          // Update frequency
          termFrequencies.set(term, (termFrequencies.get(term) || 0) + 1);

          // Track co-occurrences with query terms
          for (const queryTerm of queryTerms) {
            if (text.toLowerCase().includes(queryTerm.toLowerCase()) && 
                term.toLowerCase() !== queryTerm.toLowerCase()) {
              if (!termCoOccurrences.has(term)) {
                termCoOccurrences.set(term, new Set());
              }
              termCoOccurrences.get(term)!.add(queryTerm);
            }
          }

          // Store sample contexts
          if (!termContexts.has(term)) {
            termContexts.set(term, []);
          }
          const contexts = termContexts.get(term)!;
          if (contexts.length < 3) {
            const context = this.extractContext(text, term);
            if (context) {
              contexts.push(context);
            }
          }
        }
      }

      // Generate discovered terms
      const discoveredTerms: DiscoveredTerm[] = [];
      for (const [term, frequency] of termFrequencies.entries()) {
        if (frequency >= this.minFrequency) {
          const coOccurrences = Array.from(termCoOccurrences.get(term) || []);
          const confidence = this.calculateConfidence(frequency, coOccurrences.length, queryTerms.length);
          
          if (confidence >= this.minConfidence) {
            discoveredTerms.push({
              term,
              frequency,
              coOccurrences,
              context: termContexts.get(term) || [],
              confidence,
              suggestedDictionary: this.suggestDictionary(term, coOccurrences)
            });
          }
        }
      }

      // Sort by confidence
      discoveredTerms.sort((a, b) => b.confidence - a.confidence);

      // Generate dictionary suggestions
      const suggestions = this.generateDictionarySuggestions(discoveredTerms, queryTerms);

      return {
        discoveredTerms: discoveredTerms.slice(0, 50), // Top 50
        suggestions,
        statistics: {
          documentsAnalyzed: documents.length,
          uniqueTermsFound: termFrequencies.size,
          highConfidenceTerms: discoveredTerms.filter(t => t.confidence >= 0.7).length
        }
      };
    } catch (error) {
      console.error('Error in term discovery:', error);
      throw error;
    }
  }

  /**
   * Extract text from document for analysis
   */
  private extractText(doc: { titel?: string; samenvatting?: string; content?: string }): string {
    const parts: string[] = [];
    
    if (doc.titel) parts.push(doc.titel);
    if (doc.samenvatting) parts.push(doc.samenvatting);
    if (doc.content) {
      // Take first 1000 characters of content
      parts.push(doc.content.substring(0, 1000));
    }

    return parts.join(' ').toLowerCase();
  }

  /**
   * Extract terms from text that might be relevant
   */
  private extractTerms(text: string, queryTerms: string[]): string[] {
    const terms = new Set<string>();

    // Extract words (2+ characters, alphanumeric)
    const words = text.match(/\b[a-z]{2,}\b/gi) || [];
    
    for (const word of words) {
      const normalized = word.toLowerCase().trim();
      
      // Filter out common stop words
      if (this.isStopWord(normalized)) continue;
      
      // Filter out very short or very long terms
      if (normalized.length < 3 || normalized.length > 30) continue;
      
      // Include if it's a query term or appears frequently
      if (queryTerms.some(qt => normalized.includes(qt.toLowerCase()) || qt.toLowerCase().includes(normalized))) {
        terms.add(normalized);
      } else if (this.isPotentialTerm(normalized)) {
        terms.add(normalized);
      }
    }

    return Array.from(terms);
  }

  /**
   * Check if a word is a stop word (common words to ignore)
   */
  private isStopWord(word: string): boolean {
    const stopWords = [
      'de', 'het', 'een', 'en', 'van', 'in', 'op', 'voor', 'met', 'te', 'aan',
      'is', 'zijn', 'was', 'waren', 'wordt', 'worden', 'kan', 'kunnen', 'moet',
      'moeten', 'zou', 'zouden', 'dit', 'dat', 'deze', 'die', 'waar', 'wat',
      'wie', 'hoe', 'waarom', 'wanneer', 'waar', 'ook', 'nog', 'al', 'er',
      'maar', 'of', 'als', 'dan', 'om', 'bij', 'naar', 'over', 'uit', 'door'
    ];
    return stopWords.includes(word);
  }

  /**
   * Check if a word might be a relevant term (not a common word)
   */
  private isPotentialTerm(word: string): boolean {
    // Simple heuristic: terms that are longer or contain specific patterns
    return word.length >= 5 || /^(arbeids|huisvest|beleid|planning|ruimtelijk)/i.test(word);
  }

  /**
   * Extract context around a term (for examples)
   */
  private extractContext(text: string, term: string, contextLength: number = 50): string | null {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return null;

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + term.length + contextLength);
    return text.substring(start, end).trim();
  }

  /**
   * Calculate confidence score for a discovered term
   */
  private calculateConfidence(
    frequency: number,
    coOccurrenceCount: number,
    queryTermCount: number
  ): number {
    // Confidence based on:
    // - Frequency (more occurrences = higher confidence)
    // - Co-occurrence with query terms (more co-occurrences = higher confidence)
    // - Normalized to 0-1 range

    const frequencyScore = Math.min(1, frequency / 10); // Max at 10 occurrences
    const coOccurrenceScore = queryTermCount > 0 
      ? Math.min(1, coOccurrenceCount / queryTermCount)
      : 0;

    // Weighted combination
    return (frequencyScore * 0.6 + coOccurrenceScore * 0.4);
  }

  /**
   * Suggest which dictionary a term should be added to
   */
  private suggestDictionary(
    term: string,
    coOccurrences: string[]
  ): 'dutch' | 'planning' | 'housing' | 'policy' | 'general' {
    const termLower = term.toLowerCase();

    // Planning keywords
    if (/^(bestemmings|ruimtelijk|stedenbouw|omgevings|planning|bodem)/i.test(termLower)) {
      return 'planning';
    }

    // Housing keywords
    if (/^(huisvest|woning|woonruimte|accommodatie|arbeidsmigrant)/i.test(termLower)) {
      return 'housing';
    }

    // Policy keywords
    if (/^(beleid|regelgeving|nota|richtlijn|verordening|offici[eë]le)/i.test(termLower)) {
      return 'policy';
    }

    // Check co-occurrences for hints
    const coOccText = coOccurrences.join(' ').toLowerCase();
    if (/planning|ruimtelijk|bestemmings/i.test(coOccText)) return 'planning';
    if (/huisvest|woning|arbeidsmigrant/i.test(coOccText)) return 'housing';
    if (/beleid|regelgeving|nota/i.test(coOccText)) return 'policy';

    return 'general';
  }

  /**
   * Generate dictionary suggestions from discovered terms
   */
  private generateDictionarySuggestions(
    discoveredTerms: DiscoveredTerm[],
    queryTerms: string[]
  ): DictionarySuggestion[] {
    const suggestions: DictionarySuggestion[] = [];

    // Group terms by dictionary
    const byDictionary = new Map<string, DiscoveredTerm[]>();
    for (const term of discoveredTerms) {
      if (!byDictionary.has(term.suggestedDictionary)) {
        byDictionary.set(term.suggestedDictionary, []);
      }
      byDictionary.get(term.suggestedDictionary)!.push(term);
    }

    // Generate suggestions for each query term
    for (const queryTerm of queryTerms) {
      const relatedTerms = discoveredTerms
        .filter(t => t.coOccurrences.includes(queryTerm))
        .slice(0, 5) // Top 5 related terms
        .map(t => t.term);

      if (relatedTerms.length > 0) {
        const dictionary = this.suggestDictionary(queryTerm, []);
        suggestions.push({
          originalTerm: queryTerm,
          suggestedSynonyms: relatedTerms,
          dictionary,
          confidence: Math.max(...relatedTerms.map(t => {
            const term = discoveredTerms.find(dt => dt.term === t);
            return term?.confidence || 0;
          })),
          reasoning: `Found ${relatedTerms.length} terms that co-occur with "${queryTerm}" in recent documents`
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get statistics about term discovery
   */
  async getStatistics(): Promise<{
    totalDocuments: number;
    recentDocuments: number;
    averageTermsPerDocument: number;
  }> {
    // Use canonical document service for count
    const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
    const documentService = getCanonicalDocumentService();
    const totalDocuments = await documentService.count();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    // Use canonical document service for recent documents count
    const recentDocuments = await documentService.countByDateRange(cutoffDate, new Date());

    // Sample documents to estimate average terms - use canonical document service
    const sampleCanonical = await documentService.findByQuery({}, { limit: 100 });
    const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
    const sample = transformCanonicalArrayToLegacy(sampleCanonical);

    let totalTerms = 0;
    for (const doc of sample) {
      const text = this.extractText(doc as unknown as { titel?: string; samenvatting?: string; content?: string });
      const words = text.match(/\b[a-z]{3,}\b/gi) || [];
      totalTerms += words.length;
    }

    const averageTermsPerDocument = sample.length > 0 ? totalTerms / sample.length : 0;

    return {
      totalDocuments,
      recentDocuments,
      averageTermsPerDocument: Math.round(averageTermsPerDocument)
    };
  }
}

