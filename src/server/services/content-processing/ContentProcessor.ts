import {
    Regulation,
    SpatialUnit,
    LandUse,
    Requirement,
    RelationType,
    Relation
} from '../../domain/ontology.js';
import crypto from 'crypto';
import { RelationshipExtractionService } from '../extraction/RelationshipExtractionService.js';
import { ExtractionContext } from '../extraction/models/RelationshipModels.js';
import { logger } from '../../utils/logger.js';

/**
 * Dutch-specific text preprocessing utilities
 */
class DutchTextPreprocessor {
    /**
     * Normalizes Dutch text for better processing
     * - Handles compound words
     * - Normalizes number formats (comma to period)
     * - Removes excessive whitespace
     * - Handles Dutch-specific characters
     */
    static preprocess(text: string): string {
        if (!text || typeof text !== 'string') {
            return '';
        }

        let processed = text;

        // Normalize Dutch number format: replace comma with period for decimals
        // Pattern: digit, comma, digit (e.g., "10,5" -> "10.5")
        processed = processed.replace(/(\d+),(\d+)/g, '$1.$2');

        // Normalize whitespace (multiple spaces/newlines to single space)
        processed = processed.replace(/\s+/g, ' ');

        // Normalize Dutch-specific quote marks
        processed = processed.replace(/[""]/g, '"').replace(/['']/g, "'");

        // Remove excessive punctuation (keep single punctuation marks)
        processed = processed.replace(/[.]{2,}/g, '.');

        return processed.trim();
    }

    /**
     * Expands common Dutch compound words for better matching
     * Example: "woongebied" -> ["woon", "gebied"]
     */
    static expandCompoundWords(text: string): string[] {
        const compounds: Record<string, string[]> = {
            'woongebied': ['woon', 'gebied'],
            'bedrijventerrein': ['bedrijf', 'terrein'],
            'kantoorgebouw': ['kantoor', 'gebouw'],
            'woonwijk': ['woon', 'wijk'],
            'binnenstad': ['binnen', 'stad'],
            'industriegebied': ['industrie', 'gebied'],
            'woonbestemming': ['woon', 'bestemming'],
            'kantoorbestemming': ['kantoor', 'bestemming'],
            'bedrijfsbestemming': ['bedrijf', 'bestemming'],
            'groenbestemming': ['groen', 'bestemming']
        };

        const lowerText = text.toLowerCase();
        const expanded: string[] = [text]; // Always include original

        for (const [compound, parts] of Object.entries(compounds)) {
            if (lowerText.includes(compound)) {
                expanded.push(...parts);
            }
        }

        return expanded;
    }

    /**
     * Dutch-specific stop words that should be filtered out
     */
    static readonly DUTCH_STOP_WORDS = new Set([
        'de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'bij',
        'naar', 'over', 'onder', 'tussen', 'door', 'uit', 'tegen', 'zonder',
        'om', 'tot', 'sinds', 'tijdens', 'gedurende', 'volgens',
        'waar', 'wanneer', 'hoe', 'wat', 'wie', 'welke', 'welk',
        'dit', 'dat', 'deze', 'die', 'zo', 'zoals', 'zodat',
        'kan', 'kunnen', 'moet', 'moeten', 'zou', 'zouden', 'is', 'zijn',
        'wordt', 'worden', 'werd', 'werden', 'heeft', 'hebben', 'had', 'hadden',
        'zou', 'zouden', 'mag', 'mogen', 'moet', 'moeten',
        'en', 'of', 'maar', 'want', 'omdat', 'als', 'dan', 'ook', 'nog', 'al',
        'er', 'hier', 'daar', 'waar', 'waarom', 'hoe', 'waarop', 'waarin'
    ]);

    /**
     * Checks if a word is a Dutch stop word
     */
    static isStopWord(word: string): boolean {
        return this.DUTCH_STOP_WORDS.has(word.toLowerCase().trim());
    }

    /**
     * Normalizes Dutch grammar patterns for better entity extraction
     * Handles common Dutch sentence structures
     */
    static normalizeGrammar(text: string): string {
        let normalized = text;

        // Normalize common Dutch verb forms at start of sentences
        // "Geldt voor" -> "geldt voor"
        normalized = normalized.replace(/^([A-Z][a-z]+)\s+(geldt|is|wordt|zijn|worden)\s+/i, (_match, word, verb) => {
            return `${word.toLowerCase()} ${verb.toLowerCase()} `;
        });

        // Normalize "van toepassing" patterns
        normalized = normalized.replace(/\bvan\s+toepassing\s+op\b/gi, 'van toepassing op');

        return normalized;
    }
}

/**
 * Service to process text content and extract Knowledge Graph entities and relationships.
 * Enhanced to extract Regulations, SpatialUnits, LandUses, Requirements, and their relationships.
 * Includes Dutch-specific text preprocessing and optimization.
 * 
 * Can optionally use LLM-based relationship extraction via RelationshipExtractionService
 * for improved accuracy, while maintaining rule-based extraction as fallback.
 */
export class ContentProcessor {
    private relationshipExtractionService: RelationshipExtractionService | null = null;

    constructor(relationshipExtractionService?: RelationshipExtractionService) {
        this.relationshipExtractionService = relationshipExtractionService || null;
    }

    /**
     * Analyzes text content to find potential regulations.
     * @param text The raw text content from a document or section.
     * @param context Metadata about the source (e.g., document title).
     * @returns Array of potential Regulation entities.
     */
    extractRegulations(text: string, context: { sourceId: string; sourceTitle: string }): Regulation[] {
        const regulations: Regulation[] = [];

        // Skip completely empty texts
        if (!text || text.trim().length === 0) {
            return regulations;
        }

        // 1. Split text into paragraphs FIRST (before preprocessing to preserve paragraph boundaries)
        // Normalize line endings and split on double newlines or single newlines with spacing
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let paragraphs: string[] = [];
        
        // Try splitting on double newlines first
        if (normalizedText.includes('\n\n')) {
            paragraphs = normalizedText.split(/\n\s*\n/);
        } else {
            // If no double newlines, try splitting on single newlines with spacing
            paragraphs = normalizedText.split(/\n\s+/);
        }
        
        // Filter out empty paragraphs that can occur from splitting
        paragraphs = paragraphs.filter(p => p.trim().length > 0);
        
        // If no paragraphs after filtering, use the whole text as a single paragraph
        if (paragraphs.length === 0) {
            paragraphs = [normalizedText.trim()];
        }

        // 2. Preprocess each paragraph individually with Dutch-specific normalization
        for (const paragraph of paragraphs) {
            const preprocessedText = DutchTextPreprocessor.preprocess(paragraph);
            // Apply Dutch grammar normalization
            const normalizedParagraph = DutchTextPreprocessor.normalizeGrammar(preprocessedText);
            const cleanText = normalizedParagraph.trim();
            // Allow shorter paragraphs if they contain regulation keywords
            if (!cleanText || cleanText.length < 15) continue; // Skip very short paragraphs

            // 2. Heuristic: Check for "Regulation" keywords
            // Examples: "maximaal", "minimaal", "afstand", "geluid", "norm", "artikel"
            if (this.isPotentialRegulation(cleanText)) {
                const regulation = this.createRegulationFromText(cleanText, context);
                if (regulation && this.isValidRegulation(regulation)) {
                    regulations.push(regulation);
                }
            }
        }

        return regulations;
    }

    /**
     * Extracts entities (Regulations, SpatialUnits, LandUses, Requirements) and relationships from text.
     * This is the main method for populating the knowledge graph with semantic triples.
     * 
     * Uses rule-based extraction. For LLM-enhanced extraction, use extractEntitiesAndRelationshipsAsync.
     */
    extractEntitiesAndRelationships(
        text: string,
        context: { sourceId: string; sourceTitle: string; jurisdiction?: string }
    ): {
        entities: Array<Regulation | SpatialUnit | LandUse | Requirement>;
        relationships: Relation[];
    } {
        const entities: Array<Regulation | SpatialUnit | LandUse | Requirement> = [];
        const relationships: Relation[] = [];
        const entityMap = new Map<string, { type: string; id: string }>(); // Track entities by name

        // 1. Extract SpatialUnits (locations)
        const spatialUnits = this.extractSpatialUnits(text, context);
        for (const unit of spatialUnits) {
            entities.push(unit);
            entityMap.set(unit.name.toLowerCase(), { type: 'SpatialUnit', id: unit.id });
        }

        // 2. Extract LandUses (bestemmingen)
        const landUses = this.extractLandUses(text, context);
        for (const landUse of landUses) {
            entities.push(landUse);
            entityMap.set(landUse.name.toLowerCase(), { type: 'LandUse', id: landUse.id });
        }

        // 3. Extract Requirements (specific constraints)
        const requirements = this.extractRequirements(text, context);
        for (const req of requirements) {
            entities.push(req);
            entityMap.set(`${req.metric}-${req.value}`, { type: 'Requirement', id: req.id });
        }

        // 4. Extract Regulations
        const regulations = this.extractRegulations(text, context);
        for (const reg of regulations) {
            entities.push(reg);
            entityMap.set(reg.id, { type: 'Regulation', id: reg.id });

            // Link regulation to source document
            relationships.push({
                sourceId: reg.id,
                targetId: context.sourceId,
                type: RelationType.DEFINED_IN,
                metadata: { extractedAt: new Date().toISOString() }
            });
        }

        // 5. Extract relationships from text patterns (rule-based)
        const extractedRelationships = this.extractRelationshipsFromText(
            text,
            regulations,
            spatialUnits,
            landUses,
            requirements,
            context.sourceId
        );
        relationships.push(...extractedRelationships);

        return { entities, relationships };
    }

    /**
     * Async version that optionally uses LLM-based relationship extraction for improved accuracy.
     * Falls back to rule-based extraction if LLM extraction is disabled or fails.
     * 
     * @param text The text content to extract from
     * @param context Metadata about the source
     * @param options Optional configuration
     * @returns Entities and relationships (rule-based + optionally LLM-based)
     */
    async extractEntitiesAndRelationshipsAsync(
        text: string,
        context: { sourceId: string; sourceTitle: string; jurisdiction?: string; sourceUrl?: string },
        options?: { useLLMExtraction?: boolean; minConfidence?: number }
    ): Promise<{
        entities: Array<Regulation | SpatialUnit | LandUse | Requirement>;
        relationships: Relation[];
    }> {
        // First, extract entities and rule-based relationships
        const ruleBasedResult = this.extractEntitiesAndRelationships(text, context);
        const entities = ruleBasedResult.entities;
        const relationships: Relation[] = [...ruleBasedResult.relationships];

        // Optionally enhance with LLM-based relationship extraction
        const useLLM = options?.useLLMExtraction !== false && 
                      this.relationshipExtractionService?.isEnabled() === true;

        if (useLLM && entities.length > 0) {
            try {
                // Build extraction context for LLM service
                const extractionContext: ExtractionContext = {
                    documentId: context.sourceId,
                    documentText: text,
                    documentTitle: context.sourceTitle,
                    documentUrl: context.sourceUrl,
                    existingEntities: entities.map(entity => ({
                        id: entity.id,
                        type: entity.type,
                        name: entity.name || entity.id
                    })),
                    jurisdiction: context.jurisdiction
                };

                // Extract relationships using LLM
                const llmResult = await this.relationshipExtractionService!.extractRelationships(extractionContext);

                if (llmResult.success && llmResult.relationships.length > 0) {
                    const minConfidence = options?.minConfidence ?? 0.5;
                    
                    // Convert LLM-extracted relationships to Relation format
                    const llmRelationships: Relation[] = llmResult.relationships
                        .filter(rel => rel.confidence >= minConfidence)
                        .map(rel => ({
                            sourceId: rel.sourceId,
                            targetId: rel.targetId,
                            type: rel.type,
                            metadata: {
                                ...rel.metadata,
                                confidence: rel.confidence,
                                sourceText: rel.sourceText,
                                extractionMethod: 'llm',
                                extractedAt: new Date().toISOString()
                            }
                        }));

                    // Merge with rule-based relationships, avoiding duplicates
                    const existingRelKeys = new Set(
                        relationships.map(r => `${r.sourceId}::${r.targetId}::${r.type}`)
                    );

                    for (const llmRel of llmRelationships) {
                        const relKey = `${llmRel.sourceId}::${llmRel.targetId}::${llmRel.type}`;
                        if (!existingRelKeys.has(relKey)) {
                            relationships.push(llmRel);
                            existingRelKeys.add(relKey);
                        }
                    }

                    logger.info(
                        `[ContentProcessor] Enhanced with ${llmRelationships.length} LLM-extracted relationships ` +
                        `(from ${llmResult.relationships.length} total, min confidence: ${minConfidence})`
                    );
                } else if (!llmResult.success) {
                    logger.warn(
                        `[ContentProcessor] LLM relationship extraction failed: ${llmResult.error}. ` +
                        `Using rule-based relationships only.`
                    );
                }
            } catch (error) {
                logger.error(
                    { error },
                    '[ContentProcessor] Error during LLM relationship extraction. Falling back to rule-based relationships.'
                );
                // Continue with rule-based relationships only
            }
        }

        return { entities, relationships };
    }

    /**
     * Extracts SpatialUnits (locations) from text using Dutch location patterns.
     */
    private extractSpatialUnits(
        text: string,
        context: { sourceId: string; sourceTitle: string; jurisdiction?: string }
    ): SpatialUnit[] {
        const units: SpatialUnit[] = [];
        const seen = new Set<string>();

        // Preprocess text for better Dutch pattern matching
        const preprocessedText = DutchTextPreprocessor.preprocess(text);
        
        // Enhanced Dutch location patterns with improved accuracy
        const locationPatterns = [
            // Municipalities: "in Amsterdam", "voor Utrecht", "Gemeente Rotterdam"
            // Improved: Better handling of multi-word city names
            /\b(gemeente\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+[A-Z][a-z]+)?)\b/g,
            // Provinces: "Provincie Gelderland", "in Noord-Holland", "Zuid-Holland"
            /\b(provincie\s+)?([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g,
            // Major Dutch cities (improved recognition)
            /\b(Amsterdam|Rotterdam|Den\s+Haag|Utrecht|Eindhoven|Groningen|Tilburg|Almere|Breda|Nijmegen|Enschede|Haarlem|Arnhem|Zaanstad|Amersfoort|Apeldoorn|Hoofddorp|'s-Hertogenbosch|Maastricht|Leiden|Dordrecht|Zoetermeer|Zwolle|Deventer)\b/g,
            // Areas: "centrum", "binnenstad", "woonwijk", "bedrijventerrein"
            // Enhanced with more compound words
            /\b(centrum|binnenstad|woonwijk|bedrijventerrein|industriegebied|woongebied|kerngebied|woonbuurt|woonwijk|bedrijventerrein|woonzone|bedrijfszone|kantoorzone|groenzone|recreatiezone)\b/gi,
            // Streets/addresses: "Kerkstraat", "Hoofdstraat 1", "Prinsengracht"
            /\b([A-Z][a-z]+(?:straat|weg|laan|plein|gracht|dijk|kade|park|singel)(?:\s+\d+[a-z]?)?)\b/g,
            // Districts: "Amsterdam-Noord", "Rotterdam-Zuid", "Den Haag-Centrum"
            /\b([A-Z][a-z]+(?:-[A-Z][a-z]+)+)\b/g,
            // Regions: "Randstad", "Noord-Brabant", "Limburg"
            /\b(Randstad|Noord-Brabant|Zuid-Holland|Noord-Holland|Gelderland|Overijssel|Friesland|Groningen|Drenthe|Limburg|Zeeland|Flevoland)\b/g
        ];

        // Use Dutch stop words from preprocessor
        const excludeWords = DutchTextPreprocessor.DUTCH_STOP_WORDS;

        for (const pattern of locationPatterns) {
            const matches = preprocessedText.matchAll(pattern);
            for (const match of matches) {
                const locationName = match[2] || match[1] || match[0];
                const normalized = locationName.trim().toLowerCase();

                // Enhanced entity validation with confidence scoring
                if (!this.isValidSpatialUnit(locationName, normalized, excludeWords)) {
                    continue;
                }
                
                if (seen.has(normalized)) continue;
                seen.add(normalized);

                // Determine spatial type
                let spatialType: SpatialUnit['spatialType'] = 'ZoningArea';
                const lower = normalized.toLowerCase();
                if (lower.includes('straat') || lower.includes('weg')) {
                    spatialType = 'Street';
                } else if (lower.includes('gebouw') || lower.includes('pand')) {
                    spatialType = 'Building';
                } else if (lower.includes('perceel') || lower.includes('kavel')) {
                    spatialType = 'Parcel';
                } else if (lower.includes('wijk') || lower.includes('buurt')) {
                    spatialType = 'Neighborhood';
                }

                const id = this.generateId(`spatial-${normalized}`, context.sourceId);

                units.push({
                    id,
                    type: 'SpatialUnit',
                    name: locationName.trim(),
                    spatialType,
                    metadata: {
                        sourceId: context.sourceId,
                        extractedAt: new Date().toISOString(),
                        jurisdiction: context.jurisdiction
                    }
                });
            }
        }

        return units;
    }

    /**
     * Extracts LandUses (bestemmingen) from text using Dutch land use terminology.
     */
    private extractLandUses(
        text: string,
        context: { sourceId: string; sourceTitle: string }
    ): LandUse[] {
        const landUses: LandUse[] = [];
        const seen = new Set<string>();

        // Preprocess text for better compound word matching
        const preprocessedText = DutchTextPreprocessor.preprocess(text);
        
        // Dutch land use patterns (enhanced with compound word expansion)
        const landUsePatterns = [
            // "woonbestemming", "woonfunctie", "wonen"
            /\b(woonbestemming|woonfunctie|wonen|woongebied|woonwijk|woonbuurt)\b/gi,
            // "kantoorbestemming", "kantoorfunctie"
            /\b(kantoorbestemming|kantoorfunctie|kantoor|kantoorgebouw)\b/gi,
            // "bedrijfsbestemming", "bedrijvigheid"
            /\b(bedrijfsbestemming|bedrijvigheid|bedrijf|industrie|bedrijventerrein)\b/gi,
            // "groenbestemming", "groen"
            /\b(groenbestemming|groen|park|natuur|groengebied)\b/gi,
            // "gemengd gebruik", "mix"
            /\b(gemengd\s+gebruik|mix|gecombineerd)\b/gi,
            // "recreatie", "recreatief"
            /\b(recreatie|recreatief|sport|recreatiegebied)\b/gi
        ];

        const categories: Record<string, string> = {
            'woon': 'Wonen',
            'kantoor': 'Kantoor',
            'bedrijf': 'Bedrijvigheid',
            'groen': 'Groen',
            'gemengd': 'Gemengd',
            'recreatie': 'Recreatie'
        };

        for (const pattern of landUsePatterns) {
            const matches = preprocessedText.matchAll(pattern);
            for (const match of matches) {
                const term = match[0].toLowerCase();
                let category = 'Overig';

                // Determine category
                for (const [key, cat] of Object.entries(categories)) {
                    if (term.includes(key)) {
                        category = cat;
                        break;
                    }
                }

                if (seen.has(category)) continue;
                seen.add(category);

                const id = this.generateId(`landuse-${category}`, context.sourceId);

                landUses.push({
                    id,
                    type: 'LandUse',
                    name: category,
                    category,
                    metadata: {
                        sourceId: context.sourceId,
                        extractedAt: new Date().toISOString()
                    }
                });
            }
        }

        return landUses;
    }

    /**
     * Extracts Requirements (specific constraints) from text.
     */
    private extractRequirements(
        text: string,
        context: { sourceId: string; sourceTitle: string }
    ): Requirement[] {
        const requirements: Requirement[] = [];

        // Preprocess text for better number format handling
        const preprocessedText = DutchTextPreprocessor.preprocess(text);
        
        // Patterns for extracting requirements (enhanced for Dutch number formats)
        // Example: "maximaal 10 meter hoogte", "minimaal 5 meter afstand"
        // Note: Numbers are normalized (comma -> period) in preprocessing
        const requirementPatterns = [
            // Height: "maximaal X meter hoogte"
            /\b(maximaal|max\.?|hoogstens)\s+(\d+(?:\.\d+)?)\s*(?:meter|m)\s*(?:hoogte|hoog)?/gi,
            // Distance: "minimaal X meter afstand"
            /\b(minimaal|min\.?|ten\s+minste)\s+(\d+(?:\.\d+)?)\s*(?:meter|m)\s*(?:afstand)?/gi,
            // Noise: "maximaal X dB"
            /\b(maximaal|max\.?)\s+(\d+(?:\.\d+)?)\s*(?:dB|decibel)/gi,
            // Area: "minimaal X m2"
            /\b(minimaal|min\.?)\s+(\d+(?:\.\d+)?)\s*(?:m2|m²|vierkante\s+meter)/gi
        ];

        for (const pattern of requirementPatterns) {
            const matches = preprocessedText.matchAll(pattern);
            for (const match of matches) {
                const operator = match[1].toLowerCase().includes('max') ? '<=' : '>=';
                // Value is already normalized (comma -> period) in preprocessing
                const value = parseFloat(match[2]);

                let metric = 'unknown';
                let unit = 'm';

                if (match[0].toLowerCase().includes('hoogte') || match[0].toLowerCase().includes('hoog')) {
                    metric = 'height';
                    unit = 'm';
                } else if (match[0].toLowerCase().includes('afstand')) {
                    metric = 'distance';
                    unit = 'm';
                } else if (match[0].toLowerCase().includes('db') || match[0].toLowerCase().includes('decibel')) {
                    metric = 'noise_level';
                    unit = 'dB';
                } else if (match[0].toLowerCase().includes('m2') || match[0].toLowerCase().includes('vierkante')) {
                    metric = 'area';
                    unit = 'm²';
                }

                const id = this.generateId(`req-${metric}-${value}`, context.sourceId);

                requirements.push({
                    id,
                    type: 'Requirement',
                    name: `${metric} ${operator} ${value} ${unit}`,
                    metric,
                    operator: operator as Requirement['operator'],
                    value,
                    unit,
                    metadata: {
                        sourceId: context.sourceId,
                        extractedAt: new Date().toISOString()
                    }
                });
            }
        }

        return requirements;
    }

    /**
     * Extracts relationships from text patterns.
     * Examples: "Deze regelgeving geldt voor woonbestemmingen in Amsterdam"
     */
    private extractRelationshipsFromText(
        text: string,
        regulations: Regulation[],
        spatialUnits: SpatialUnit[],
        landUses: LandUse[],
        requirements: Requirement[],
        _sourceId: string
    ): Relation[] {
        const relationships: Relation[] = [];

        // Pattern: "geldt voor" / "van toepassing op" -> APPLIES_TO
        // Note: Using case-insensitive flag only (not global) to avoid lastIndex bug with .test()
        const appliesToPattern = /\b(geldt\s+voor|van\s+toepassing\s+op|is\s+van\s+toepassing\s+op|betreft)\b/i;

        for (const reg of regulations) {
            // Find APPLIES_TO relationships with SpatialUnits
            for (const spatialUnit of spatialUnits) {
                // Check if regulation and spatial unit appear in same context
                const regContext = this.getContextAround(text, reg.description || reg.name, 200);
                if (regContext && regContext.toLowerCase().includes(spatialUnit.name.toLowerCase())) {
                    // Check for applies-to pattern
                    if (appliesToPattern.test(regContext)) {
                        relationships.push({
                            sourceId: reg.id,
                            targetId: spatialUnit.id,
                            type: RelationType.APPLIES_TO,
                            metadata: { extractedAt: new Date().toISOString() }
                        });
                    }
                }
            }

            // Find APPLIES_TO relationships with LandUses
            for (const landUse of landUses) {
                const regContext = this.getContextAround(text, reg.description || reg.name, 200);
                if (regContext && regContext.toLowerCase().includes(landUse.name.toLowerCase())) {
                    if (appliesToPattern.test(regContext)) {
                        relationships.push({
                            sourceId: reg.id,
                            targetId: landUse.id,
                            type: RelationType.APPLIES_TO,
                            metadata: { extractedAt: new Date().toISOString() }
                        });
                    }
                }
            }

            // Link Requirements to Regulations
            for (const req of requirements) {
                const regContext = this.getContextAround(text, reg.description || reg.name, 200);
                if (regContext && regContext.includes(req.name)) {
                    relationships.push({
                        sourceId: reg.id,
                        targetId: req.id,
                        type: RelationType.HAS_REQUIREMENT,
                        metadata: { extractedAt: new Date().toISOString() }
                    });
                }
            }
        }

        // Pattern: "gelegen in" / "ligt in" -> LOCATED_IN
        // Note: Using case-insensitive flag only (not global) and moved outside loop for efficiency
        const locationPattern = /\b(gelegen\s+in|ligt\s+in|in\s+de\s+buurt\s+van|onderdeel\s+van)\b/i;
        
        // Pre-compute lowercase names for efficiency
        const spatialUnitLowerNames = spatialUnits.map(u => u.name.toLowerCase());

        for (let i = 0; i < spatialUnits.length; i++) {
            const unit1 = spatialUnits[i];

            // Optimization: Get context once per outer loop iteration
            const context = this.getContextAround(text, unit1.name, 100);
            if (!context) continue;

            // Optimization: Check for location pattern once per context
            // If the pattern isn't in the context, we can't form a LOCATED_IN relationship
            if (!locationPattern.test(context)) continue;

            const contextLower = context.toLowerCase();

            for (let j = 0; j < spatialUnits.length; j++) {
                if (i === j) continue;

                const unit2 = spatialUnits[j];
                const unit2Lower = spatialUnitLowerNames[j];

                // Check if unit1 is mentioned near unit2
                // Note: We already checked locationPattern exists in context
                if (contextLower.includes(unit2Lower)) {
                    relationships.push({
                        sourceId: unit1.id,
                        targetId: unit2.id,
                        type: RelationType.LOCATED_IN,
                        metadata: { extractedAt: new Date().toISOString() }
                    });
                }
            }
        }

        // Link Requirements to SpatialUnits (CONSTRAINS)
        for (const req of requirements) {
            // Optimization: Get context once per requirement
            const reqContext = this.getContextAround(text, req.name, 150);
            if (!reqContext) continue;

            const reqContextLower = reqContext.toLowerCase();

            for (let j = 0; j < spatialUnits.length; j++) {
                const spatialUnit = spatialUnits[j];
                const spatialUnitLower = spatialUnitLowerNames[j];

                if (reqContextLower.includes(spatialUnitLower)) {
                    relationships.push({
                        sourceId: req.id,
                        targetId: spatialUnit.id,
                        type: RelationType.CONSTRAINS,
                        metadata: { extractedAt: new Date().toISOString() }
                    });
                }
            }
        }

        return relationships;
    }

    /**
     * Gets context around a search term in text.
     */
    private getContextAround(text: string, searchTerm: string, contextLength: number): string | null {
        const index = text.toLowerCase().indexOf(searchTerm.toLowerCase());
        if (index === -1) return null;

        const start = Math.max(0, index - contextLength);
        const end = Math.min(text.length, index + searchTerm.length + contextLength);
        return text.substring(start, end);
    }

    /**
     * Generates a deterministic ID from a seed string.
     */
    private generateId(seed: string, sourceId: string): string {
        const hash = crypto.createHash('md5').update(`${sourceId}-${seed}`).digest('hex');
        return `${seed.split('-')[0]}-${hash.substring(0, 8)}`;
    }

    /**
     * Simple heuristic to determine if a text block might contain a regulation.
     */
    private isPotentialRegulation(text: string): boolean {
        const keywords = [
            'maximaal', 'minimaal', 'maximale', 'minimale', 'niet toegestaan', 'verplicht',
            'afstand', 'meter', 'dB', 'geluid', 'parkeernorm',
            'artikel', 'lid', 'bepaling'
        ];

        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword));
    }

    /**
     * Validate that a spatial unit entity is meaningful and not noise
     * Enhanced validation with confidence scoring for improved NER accuracy
     */
    private isValidSpatialUnit(
        _locationName: string,
        normalized: string,
        excludeWords: Set<string>
    ): boolean {
        // Basic length check
        if (normalized.length < 3) return false;
        
        // Stop word check
        if (excludeWords.has(normalized)) return false;
        
        // Single word check - must not be a common stop word
        const words = normalized.split(/\s+/);
        if (words.length === 1 && excludeWords.has(words[0])) return false;
        
        // Short word check - allow if it's a street/road name
        if (normalized.length < 4 && !normalized.includes('straat') && !normalized.includes('weg') && !normalized.includes('laan')) {
            return false;
        }
        
        // Confidence scoring: higher confidence for known patterns
        let confidence = 0.5; // Base confidence
        
        // Known city names get higher confidence
        const knownCities = ['amsterdam', 'rotterdam', 'utrecht', 'den haag', 'eindhoven', 'groningen'];
        if (knownCities.some(city => normalized.includes(city))) {
            confidence += 0.3;
        }
        
        // Street/road patterns get higher confidence
        if (normalized.includes('straat') || normalized.includes('weg') || normalized.includes('laan')) {
            confidence += 0.2;
        }
        
        // Province names get higher confidence
        const provinces = ['noord-holland', 'zuid-holland', 'noord-brabant', 'gelderland', 'overijssel'];
        if (provinces.some(prov => normalized.includes(prov))) {
            confidence += 0.3;
        }
        
        // Reject low confidence entities
        return confidence >= 0.5;
    }

    /**
     * Validate that a regulation entity is meaningful and not noise
     */
    private isValidRegulation(regulation: Regulation): boolean {
        // Filter out regulations with very generic names
        const genericNames = ['regel', 'norm', 'eis', 'bepaling', 'artikel', 'lid'];
        const normalizedName = regulation.name.toLowerCase().trim();
        
        // Skip if name is too short
        if (normalizedName.length < 5) return false;
        
        // Only reject if name is exactly a generic name or starts with generic name + nothing meaningful
        // Allow names like "Regel uit Document" as they have context
        const exactGenericMatch = genericNames.some(gen => normalizedName === gen);
        if (exactGenericMatch) {
            return false;
        }
        
        // Allow names that start with generic word but have additional context (like "Regel uit Test Doc")
        // Only reject if it's just "genericword" or "genericword " with nothing after
        const startsWithGeneric = genericNames.some(gen => {
            if (normalizedName.startsWith(gen + ' ')) {
                // Check if there's meaningful content after the generic word
                const afterGeneric = normalizedName.substring(gen.length + 1).trim();
                return afterGeneric.length < 3; // Reject if less than 3 chars after generic word
            }
            return false;
        });
        if (startsWithGeneric) {
            return false;
        }
        
        return true;
    }

    /**
     * Creates a Regulation entity from a text block.
     */
    private createRegulationFromText(text: string, context: { sourceId: string; sourceTitle: string }): Regulation | null {
        // Generate a deterministic ID
        const hash = crypto.createHash('md5').update(`${context.sourceId}-${text.substring(0, 50)}`).digest('hex');
        const id = `reg-${hash.substring(0, 8)}`;

        // Determine category based on keywords
        let category: Regulation['category'] = 'Zoning'; // Default
        const lowerText = text.toLowerCase();

        if (lowerText.includes('geluid') || lowerText.includes('db') || lowerText.includes('milieu')) {
            category = 'Environmental';
        } else if (lowerText.includes('bouw') || lowerText.includes('hoogte')) {
            category = 'Building';
        } else if (lowerText.includes('procedure') || lowerText.includes('aanvraag')) {
            category = 'Procedural';
        }

        // Truncate name for readability
        const _name = text.length > 50 ? text.substring(0, 47) + '...' : text;

        return {
            id,
            type: 'Regulation',
            name: `Regel uit ${context.sourceTitle}`,
            description: text, // The full text is the description/content of the regulation
            category,
            metadata: {
                sourceId: context.sourceId,
                extractedAt: new Date().toISOString()
            }
        };
    }
}

export const contentProcessor = new ContentProcessor();
