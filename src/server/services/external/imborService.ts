/**
 * IMBOR Service
 * 
 * Provides vocabulary and function definitions from IMBOR (RDF/Turtle files).
 * Parses SKOS vocabulary from Turtle files.
 */

import { Parser, Store } from 'n3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ImborDefinition {
    term: string;
    definition: string;
    type?: string;
    uri?: string;
    broaderUri?: string; // For hierarchical relationships
}

export interface ExtractedKeyword {
    term: string;
    confidence: number;
    canonicalTerm?: string; // Official IMBOR term if normalized
    parentTerms?: string[]; // Hierarchical parent concepts
}

export interface ImborFunction {
    term: string;
    functions: string[];
    relatedTerms: string[];
}

export class ImborService {
    private vocabulary: Map<string, ImborDefinition> = new Map();
    private uriToTerm: Map<string, string> = new Map(); // URI -> canonical term mapping
    private termNormalization: Map<string, string> = new Map(); // Informal -> official term mapping
    private functions: Map<string, ImborFunction> = new Map();
    private store: Store = new Store();
    private isLoaded = false;
    private readonly CONFIDENCE_THRESHOLD = 0.6; // Minimum confidence score to include keyword

    constructor() {
        // Load asynchronously
        this.loadVocabulary().catch(err => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error(
                { error: errorMessage },
                'Failed to load IMBOR vocabulary, falling back to basic mode'
            );
        });
    }

    /**
     * Load IMBOR vocabulary from Turtle files
     */
    private async loadVocabulary(): Promise<void> {
        try {
            // Path to IMBOR files (relative to server/src/services)
            const imborPath = join(__dirname, '../../../IMBOR');
            const vocabularyFile = join(imborPath, 'Vocabulaire_00_2025-11-19_2111.ttl');

            logger.info({ vocabularyFile }, 'Loading IMBOR vocabulary');

            // Read the Turtle file
            const ttlContent = readFileSync(vocabularyFile, 'utf-8');

            // Parse the Turtle file
            const parser = new Parser();
            const quads = parser.parse(ttlContent);

            // Add to store
            for (const quad of quads) {
              this.store.add(quad);
            }

            // Extract vocabulary terms
            this.extractVocabulary();

            this.isLoaded = true;
            logger.info(
                { vocabularySize: this.vocabulary.size },
                'IMBOR Service initialized'
            );
        } catch (error) {
            // Don't re-throw - gracefully handle missing IMBOR files
            // The service will work in basic mode without the vocabulary
            const errorMessage = error instanceof Error ? error.message : String(error);
            const vocabularyPath = join(__dirname, '../../../IMBOR/Vocabulaire_00_2025-11-19_2111.ttl');
            if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
                logger.warn(
                    { vocabularyPath },
                    'IMBOR vocabulary file not found. Service will operate in basic mode. To enable full IMBOR features, ensure the vocabulary file exists'
                );
            } else {
                logger.error(
                    { error: errorMessage, vocabularyPath },
                    'Error loading IMBOR vocabulary'
                );
            }
            // Service will continue without IMBOR vocabulary
            this.isLoaded = false;
        }
    }

    /**
     * Extract vocabulary from RDF store
     */
    private extractVocabulary(): void {
        // SKOS namespace
        const SKOS = 'http://www.w3.org/2004/02/skos/core#';
        const prefLabelPredicate = `${SKOS}prefLabel`;
        const definitionPredicate = `${SKOS}definition`;
        const broaderPredicate = `${SKOS}broader`;

        // Get all concepts with prefLabel
        const concepts = new Map<string, { label?: string; definition?: string; broader?: string }>();

        // Iterate through all quads
        for (const quad of this.store.getQuads(null as any, null as any, null as any, null as any)) {
            const subject = quad.subject.value;
            const predicate = quad.predicate.value;
            const object = quad.object.value;

            if (!concepts.has(subject)) {
                concepts.set(subject, {});
            }

            const concept = concepts.get(subject)!;

            if (predicate === prefLabelPredicate) {
                concept.label = object;
            } else if (predicate === definitionPredicate) {
                concept.definition = object;
            } else if (predicate === broaderPredicate) {
                concept.broader = object;
            }
        }

        // Convert to vocabulary map
        for (const [uri, concept] of concepts.entries()) {
            if (concept.label && concept.definition) {
                const term = concept.label.toLowerCase();
                const canonicalTerm = concept.label; // Keep original casing
                this.vocabulary.set(term, {
                    term: canonicalTerm,
                    definition: concept.definition,
                    type: 'concept',
                    uri,
                    broaderUri: concept.broader
                });
                this.uriToTerm.set(uri, canonicalTerm);

                // Also index by partial matches (useful for search)
                const words = term.split(/\s+/);
                if (words.length > 1) {
                    words.forEach(word => {
                        if (word.length > 3 && !this.vocabulary.has(word)) {
                            // Store reference to full term
                            this.vocabulary.set(word, {
                                term: canonicalTerm,
                                definition: concept.definition!,
                                type: 'partial',
                                uri,
                                broaderUri: concept.broader
                            });
                        }
                    });
                }

                // Build normalization mappings for common variations
                // Normalize common informal terms to official IMBOR terms
                this.buildNormalizationMappings(term, canonicalTerm);
            }
        }
    }

    /**
     * Build normalization mappings from informal terms to official IMBOR terms
     */
    private buildNormalizationMappings(term: string, canonicalTerm: string): void {
        // Common normalization patterns
        const normalizations: Array<[string, string]> = [
            ['rioolwater', 'afvalwater'],
            ['straat', 'verharding'],
            ['weg', 'verharding'],
            ['waterkwaliteit', 'waterkwaliteit'],
            ['oppervlaktewater', 'oppervlaktewater']
        ];

        // Apply known normalizations
        for (const [informal, official] of normalizations) {
            if (term.includes(informal) || canonicalTerm.toLowerCase().includes(informal)) {
                // Find the official term in vocabulary
                const officialDef = this.vocabulary.get(official);
                if (officialDef) {
                    this.termNormalization.set(informal, officialDef.term);
                }
            }
        }
    }

    /**
     * Calculate string similarity using simple Levenshtein-like distance
     * Returns a value between 0 (completely different) and 1 (identical)
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();

        // Exact match
        if (s1 === s2) return 1.0;

        // Substring match
        if (s1.includes(s2) || s2.includes(s1)) {
            const longer = Math.max(s1.length, s2.length);
            const shorter = Math.min(s1.length, s2.length);
            return shorter / longer;
        }

        // Word-based matching
        const words1 = s1.split(/\s+/);
        const words2 = s2.split(/\s+/);
        let matchingWords = 0;
        for (const w1 of words1) {
            for (const w2 of words2) {
                if (w1 === w2 && w1.length > 3) {
                    matchingWords++;
                    break;
                } else if (w1.includes(w2) || w2.includes(w1)) {
                    matchingWords += 0.5;
                    break;
                }
            }
        }
        if (matchingWords > 0) {
            return matchingWords / Math.max(words1.length, words2.length);
        }

        // Simple character-based similarity
        const maxLen = Math.max(s1.length, s2.length);
        let matches = 0;
        const minLen = Math.min(s1.length, s2.length);
        for (let i = 0; i < minLen; i++) {
            if (s1[i] === s2[i]) matches++;
        }
        return matches / maxLen;
    }

    /**
     * Get parent terms (broader concepts) for a given term
     */
    private getParentTerms(term: string): string[] {
        const def = this.vocabulary.get(term.toLowerCase());
        if (!def || !def.broaderUri) return [];

        const parentTerms: string[] = [];
        let currentUri: string | undefined = def.broaderUri;

        // Traverse up the hierarchy (limit depth to prevent infinite loops)
        let depth = 0;
        const maxDepth = 5;
        const visitedUris = new Set<string>();

        while (currentUri && depth < maxDepth && !visitedUris.has(currentUri)) {
            visitedUris.add(currentUri);
            
            // Find the definition with this URI
            const parentTerm = this.uriToTerm.get(currentUri);
            let parentDef: ImborDefinition | undefined;
            if (parentTerm) {
                parentDef = this.vocabulary.get(parentTerm.toLowerCase());
            }

            if (parentDef && parentDef.term) {
                parentTerms.push(parentDef.term);
                currentUri = parentDef.broaderUri;
            } else {
                break;
            }
            depth++;
        }

        return parentTerms;
    }

    /**
     * Extract IMBOR keywords from markdown content
     * Returns keywords with confidence scores, normalized terms, and hierarchical relationships
     */
    async extractKeywords(content: string): Promise<ExtractedKeyword[]> {
        await this.waitForLoad();

        if (!this.isLoaded) {
            logger.warn('IMBOR vocabulary not loaded, returning empty keywords');
            return [];
        }

        // Normalize content: lowercase, remove markdown syntax, split into words
        const normalizedContent = content
            .toLowerCase()
            .replace(/[#*`_~[\]()]/g, ' ') // Remove markdown syntax
            .replace(/\s+/g, ' ')
            .trim();

        const contentWords = normalizedContent.split(/\s+/);
        const keywordCandidates = new Map<string, { confidence: number; term: string; uri?: string }>();

        // Search for IMBOR terms in content using fuzzy matching
        for (const [vocabTerm, definition] of this.vocabulary.entries()) {
            if (definition.type === 'partial') continue; // Skip partial matches in initial pass

            const vocabWords = vocabTerm.split(/\s+/);
            let maxSimilarity = 0;

            // Check for exact or fuzzy matches
            for (let i = 0; i <= contentWords.length - vocabWords.length; i++) {
                const candidate = contentWords.slice(i, i + vocabWords.length).join(' ');
                const similarity = this.calculateSimilarity(vocabTerm, candidate);

                // Also check individual word matches for multi-word terms
                if (vocabWords.length > 1) {
                    let wordMatches = 0;
                    for (const vWord of vocabWords) {
                        for (let j = 0; j < contentWords.length; j++) {
                            if (this.calculateSimilarity(vWord, contentWords[j]) > 0.8) {
                                wordMatches++;
                                break;
                            }
                        }
                    }
                    const wordSimilarity = wordMatches / vocabWords.length;
                    maxSimilarity = Math.max(maxSimilarity, similarity, wordSimilarity * 0.9);
                } else {
                    // Single word term - check all words in content
                    for (const cWord of contentWords) {
                        if (cWord.length > 3) { // Only check words longer than 3 chars
                            const similarity = this.calculateSimilarity(vocabTerm, cWord);
                            maxSimilarity = Math.max(maxSimilarity, similarity);
                        }
                    }
                }

                maxSimilarity = Math.max(maxSimilarity, similarity);
            }

            // If similarity exceeds threshold, add as candidate
            if (maxSimilarity >= this.CONFIDENCE_THRESHOLD) {
                const existing = keywordCandidates.get(definition.term);
                if (!existing || existing.confidence < maxSimilarity) {
                    keywordCandidates.set(definition.term, {
                        confidence: maxSimilarity,
                        term: definition.term,
                        uri: definition.uri
                    });
                }
            }
        }

        // Normalize keywords and add hierarchical relationships
        const extractedKeywords: ExtractedKeyword[] = [];
        for (const [term, candidate] of keywordCandidates.entries()) {
            // Check for normalization (informal -> official)
            let canonicalTerm = term;
            const normalized = this.termNormalization.get(term.toLowerCase());
            if (normalized) {
                canonicalTerm = normalized;
            }

            // Get parent terms (hierarchical relationships)
            const parentTerms = this.getParentTerms(term.toLowerCase());

            extractedKeywords.push({
                term: canonicalTerm,
                confidence: candidate.confidence,
                canonicalTerm: normalized ? canonicalTerm : undefined,
                parentTerms: parentTerms.length > 0 ? parentTerms : undefined
            });
        }

        // Sort by confidence (highest first) and remove duplicates
        extractedKeywords.sort((a, b) => b.confidence - a.confidence);

        // Remove duplicates (keep highest confidence)
        const uniqueKeywords = new Map<string, ExtractedKeyword>();
        for (const kw of extractedKeywords) {
            const key = kw.term.toLowerCase();
            if (!uniqueKeywords.has(key) || (uniqueKeywords.get(key)?.confidence || 0) < kw.confidence) {
                uniqueKeywords.set(key, kw);
            }
        }

        const result = Array.from(uniqueKeywords.values());
        logger.debug(
            { keywordCount: result.length },
            'Extracted IMBOR keywords from content'
        );
        return result;
    }

    /**
   * Wait for vocabulary to load
   */
    async waitForLoad(): Promise<void> {
        // Simple polling for loaded state
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();

        while (!this.isLoaded && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!this.isLoaded) {
            logger.warn('IMBOR vocabulary not loaded within timeout');
        }
    }

    /**
     * Get the definition of a term
     */
    getDefinition(term: string): ImborDefinition | undefined {
        return this.vocabulary.get(term.toLowerCase());
    }

    /**
     * Get the functions and related terms for a term
     */
    getFunctions(term: string): ImborFunction | undefined {
        return this.functions.get(term.toLowerCase());
    }

    /**
     * Get all related terms for a given term
     */
    getRelatedTerms(term: string): string[] {
        const func = this.getFunctions(term);
        return func?.relatedTerms || [];
    }

    /**
     * Enhance a query with IMBOR context
     * Returns additional search terms and context
     */
    enhanceQuery(onderwerp: string, thema: string): {
        enhancedTerms: string[];
        context: string;
    } {
        if (!this.isLoaded) {
            logger.warn({ onderwerp, thema }, 'IMBOR not loaded, returning basic query');
            return {
                enhancedTerms: [onderwerp, thema],
                context: ''
            };
        }

        const terms = [onderwerp, thema];
        const enhancedTerms: Set<string> = new Set([onderwerp, thema]);
        let context = '';

        // Get definitions and related terms
        terms.forEach(term => {
            const definition = this.getDefinition(term);
            const functions = this.getFunctions(term);

            if (definition) {
                context += `${term}: ${definition.definition}. `;
            }

            if (functions) {
                functions.relatedTerms.forEach(related => enhancedTerms.add(related));
            }
        });

        logger.debug(
            { onderwerp, thema, enhancedTerms: Array.from(enhancedTerms) },
            'Enhanced query with IMBOR context'
        );

        return {
            enhancedTerms: Array.from(enhancedTerms),
            context: context.trim()
        };
    }

    /**
     * Check if a term is in the IMBOR vocabulary
     */
    hasTerm(term: string): boolean {
        return this.vocabulary.has(term.toLowerCase());
    }

    /**
     * Get all vocabulary terms (for debugging/testing)
     */
    getAllTerms(): string[] {
        return Array.from(this.vocabulary.keys());
    }
}
