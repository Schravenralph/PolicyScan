import { BaseEntity, Regulation, SpatialUnit, LandUse } from '../../domain/ontology.js';
import fs from 'fs/promises';
import path from 'path';

export interface SemanticLabelingOptions {
    language?: 'nl' | 'en';
    domain?: 'policy' | 'spatial' | 'environmental';
    useLLM?: boolean;
    maxLabelLength?: number;
}

/**
 * Represents a hierarchical label with parent-child relationships
 */
export interface HierarchicalLabel {
    id: string;
    label: string;
    level: number; // 0 = root, 1+ = nested levels
    parentId?: string;
    childrenIds: string[];
    entityIds: string[]; // Entities associated with this label
}

/**
 * Options for hierarchical label generation
 */
export interface HierarchicalLabelingOptions extends SemanticLabelingOptions {
    parentLabel?: string; // Optional parent label context
    buildHierarchy?: boolean; // Whether to automatically build hierarchy
    maxLevels?: number; // Maximum hierarchy depth
}

/**
 * Service for generating semantic labels for knowledge graph clusters.
 * Uses LLM when available, falls back to heuristic-based labeling.
 * 
 * Based on Microsoft GraphRAG best practices for semantic community labeling.
 * 
 * Cost Controls:
 * - Uses gpt-4o-mini (cheapest model: ~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens)
 * - Limits to 20 tokens per label (very short)
 * - Caches labels to avoid re-labeling
 * - Tracks usage to stay within budget
 * - Persists usage and cache to disk
 */
export class SemanticLabelingService {
    private llmAvailable: boolean = false;
    private llmApiKey?: string;
    private labelCache: Map<string, string> = new Map();
    private hierarchicalLabelCache: Map<string, HierarchicalLabel> = new Map();
    private usageTracker: { tokensUsed: number; costEUR: number } = { tokensUsed: 0, costEUR: 0 };
    private cacheFilePath: string;
    private hierarchicalCacheFilePath: string;
    private usageFilePath: string;
    private activeLearningService?: import('./ActiveLearningService.js').ActiveLearningService;
    
    // Cost tracking (gpt-4o-mini pricing as of 2024)
    // Prices: $0.15 per 1M input tokens, $0.60 per 1M output tokens
    // Converting to EUR (approximate 1:1 for safety)
    private readonly INPUT_COST_PER_1M_TOKENS_EUR = 0.15; // €0.15 per 1M input tokens
    private readonly OUTPUT_COST_PER_1M_TOKENS_EUR = 0.60; // €0.60 per 1M output tokens
    private readonly MAX_BUDGET_EUR = 5.0; // 5 euros budget
    private readonly ESTIMATED_TOKENS_PER_LABEL = 100; // ~80 input + 20 output (optimized)
    
    // Cache size limits to prevent memory exhaustion
    // Default: 10000 entries per cache (configurable via env)
    private readonly MAX_LABEL_CACHE_SIZE = parseInt(process.env.SEMANTIC_LABEL_CACHE_MAX_SIZE || '10000', 10);
    private readonly MAX_HIERARCHICAL_CACHE_SIZE = parseInt(process.env.SEMANTIC_HIERARCHICAL_CACHE_MAX_SIZE || '10000', 10);

    constructor() {
        // Set up persistence paths
        const dataDir = path.join(process.cwd(), 'data');
        this.cacheFilePath = path.join(dataDir, 'semantic-label-cache.json');
        this.hierarchicalCacheFilePath = path.join(dataDir, 'semantic-label-hierarchical-cache.json');
        this.usageFilePath = path.join(dataDir, 'semantic-label-usage.json');
        
        // Check if LLM API is configured
        this.llmApiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
        this.llmAvailable = !!this.llmApiKey;
        
        // Load persisted data
        this.loadPersistedData().catch(err => {
            console.warn('[SemanticLabeling] Failed to load persisted data:', err);
        });
        
        if (!this.llmAvailable) {
            console.log('[SemanticLabeling] LLM not configured, using heuristic-based labeling');
        } else {
            // Calculate estimated capacity: budget / cost per label
            const costPerLabel = (this.ESTIMATED_TOKENS_PER_LABEL * 0.8 * this.INPUT_COST_PER_1M_TOKENS_EUR / 1000000) +
                                (this.ESTIMATED_TOKENS_PER_LABEL * 0.2 * this.OUTPUT_COST_PER_1M_TOKENS_EUR / 1000000);
            const estimatedCapacity = Math.floor(this.MAX_BUDGET_EUR / costPerLabel);
            console.log('[SemanticLabeling] LLM configured, budget limit: €5.00');
            console.log(`[SemanticLabeling] Estimated capacity: ~${estimatedCapacity} labels`);
            console.log('[SemanticLabeling] Using gpt-4o-mini (cheapest model)');
            console.log(`[SemanticLabeling] Current usage: ${this.usageTracker.tokensUsed} tokens, €${this.usageTracker.costEUR.toFixed(4)}`);
            console.log(`[SemanticLabeling] Cache size: ${this.labelCache.size} labels`);
        }
    }

    /**
     * Load persisted cache and usage data from disk
     */
    private async loadPersistedData(): Promise<void> {
        try {
            // Load flat label cache
            try {
                const cacheData = await fs.readFile(this.cacheFilePath, 'utf-8');
                const cache = JSON.parse(cacheData);
                this.labelCache = new Map(cache);
                console.log(`[SemanticLabeling] Loaded ${this.labelCache.size} cached labels`);
            } catch (_err) {
                // Cache file doesn't exist yet, that's ok
            }

            // Load hierarchical label cache
            try {
                const hierarchicalData = await fs.readFile(this.hierarchicalCacheFilePath, 'utf-8');
                const hierarchicalCache = JSON.parse(hierarchicalData);
                // Convert array of entries back to Map
                this.hierarchicalLabelCache = new Map(hierarchicalCache);
                console.log(`[SemanticLabeling] Loaded ${this.hierarchicalLabelCache.size} cached hierarchical labels`);
            } catch (_err) {
                // Hierarchical cache file doesn't exist yet, that's ok
            }

            // Load usage tracker
            try {
                const usageData = await fs.readFile(this.usageFilePath, 'utf-8');
                this.usageTracker = JSON.parse(usageData);
                console.log(`[SemanticLabeling] Loaded usage: ${this.usageTracker.tokensUsed} tokens, €${this.usageTracker.costEUR.toFixed(4)}`);
            } catch (_err) {
                // Usage file doesn't exist yet, that's ok
            }
        } catch (error) {
            console.warn('[SemanticLabeling] Error loading persisted data:', error);
        }
    }

    /**
     * Save cache and usage data to disk
     */
    private async persistData(): Promise<void> {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.cacheFilePath);
            await fs.mkdir(dataDir, { recursive: true });

            // Save flat label cache
            const cacheArray = Array.from(this.labelCache.entries());
            await fs.writeFile(this.cacheFilePath, JSON.stringify(cacheArray, null, 2));
            
            // Save hierarchical label cache
            const hierarchicalArray = Array.from(this.hierarchicalLabelCache.entries());
            await fs.writeFile(this.hierarchicalCacheFilePath, JSON.stringify(hierarchicalArray, null, 2));
            
            // Save usage tracker
            await fs.writeFile(this.usageFilePath, JSON.stringify(this.usageTracker, null, 2));
        } catch (error) {
            console.warn('[SemanticLabeling] Error persisting data:', error);
        }
    }

    /**
     * Generate a semantic label for a cluster of entities.
     * 
     * @param entities Array of entities in the cluster
     * @param options Labeling options
     * @returns Semantic label (e.g., "Bodemkwaliteit" instead of "Community 9278")
     */
    async generateSemanticLabel(
        entities: BaseEntity[],
        options: SemanticLabelingOptions = {}
    ): Promise<string> {
        const {
            language = 'nl',
            domain = 'policy',
            useLLM = this.llmAvailable,
            maxLabelLength = 50
        } = options;

        if (entities.length === 0) {
            return 'Lege Cluster';
        }

        // Create cache key from entity IDs
        const cacheKey = entities.map(e => e.id).sort().join('|');
        
        // Check cache first
        if (this.labelCache.has(cacheKey)) {
            return this.labelCache.get(cacheKey)!;
        }

        // Check budget before using LLM
        if (useLLM && this.llmAvailable) {
            const estimatedCost = this.estimateCost(this.ESTIMATED_TOKENS_PER_LABEL);
            if (this.usageTracker.costEUR + estimatedCost > this.MAX_BUDGET_EUR) {
                console.warn(`[SemanticLabeling] Budget limit reached (€${this.usageTracker.costEUR.toFixed(2)}), using heuristic labeling`);
                const label = this.generateLabelWithHeuristics(entities, { language, domain, maxLabelLength });
                this.setLabelCache(cacheKey, label);
                await this.persistData(); // Persist after adding to cache
                return label;
            }

            try {
                const label = await this.generateLabelWithLLM(entities, { language, domain });
                // Validate label quality before accepting
                const validatedLabel = this.validateLabel(label);
                if (validatedLabel && validatedLabel.length <= maxLabelLength) {
                    // Cache the label
                    this.setLabelCache(cacheKey, validatedLabel);
                    await this.persistData(); // Persist after adding to cache and tracking usage
                    return validatedLabel;
                } else if (!validatedLabel) {
                    console.warn('[SemanticLabeling] LLM generated low-quality label, falling back to heuristics');
                }
            } catch (error) {
                console.warn('[SemanticLabeling] LLM labeling failed, falling back to heuristics:', error);
            }
        }

        // Fallback to heuristic-based labeling
        const label = this.generateLabelWithHeuristics(entities, { language, domain, maxLabelLength });
        // Validate heuristic label quality
        const validatedLabel = this.validateLabel(label) || label; // Use original if validation fails (heuristic is already fallback)
        this.setLabelCache(cacheKey, validatedLabel);
        await this.persistData(); // Persist after adding to cache
        return validatedLabel;
    }

    /**
     * Set label in cache with size limit enforcement (LRU eviction)
     */
    private setLabelCache(key: string, value: string): void {
        // If cache is at capacity and key doesn't exist, evict oldest entry
        if (this.labelCache.size >= this.MAX_LABEL_CACHE_SIZE && !this.labelCache.has(key)) {
            // Simple LRU: remove first entry (oldest)
            const firstKey = this.labelCache.keys().next().value;
            if (firstKey) {
                this.labelCache.delete(firstKey);
            }
        }
        this.labelCache.set(key, value);
    }

    /**
     * Set hierarchical label in cache with size limit enforcement (LRU eviction)
     */
    private setHierarchicalLabelCache(key: string, value: HierarchicalLabel): void {
        // If cache is at capacity and key doesn't exist, evict oldest entry
        if (this.hierarchicalLabelCache.size >= this.MAX_HIERARCHICAL_CACHE_SIZE && !this.hierarchicalLabelCache.has(key)) {
            // Simple LRU: remove first entry (oldest)
            const firstKey = this.hierarchicalLabelCache.keys().next().value;
            if (firstKey) {
                this.hierarchicalLabelCache.delete(firstKey);
            }
        }
        this.hierarchicalLabelCache.set(key, value);
    }

    /**
     * Estimate cost for a given number of tokens
     */
    private estimateCost(tokens: number): number {
        // Rough estimate: assume 80% input, 20% output
        const inputTokens = tokens * 0.8;
        const outputTokens = tokens * 0.2;
        const costEUR = (inputTokens / 1000000) * this.INPUT_COST_PER_1M_TOKENS_EUR + 
                       (outputTokens / 1000000) * this.OUTPUT_COST_PER_1M_TOKENS_EUR;
        return costEUR;
    }

    /**
     * Track token usage and cost
     */
    private trackUsage(inputTokens: number, outputTokens: number): void {
        const costEUR = (inputTokens / 1000000) * this.INPUT_COST_PER_1M_TOKENS_EUR + 
                       (outputTokens / 1000000) * this.OUTPUT_COST_PER_1M_TOKENS_EUR;
        this.usageTracker.tokensUsed += (inputTokens + outputTokens);
        this.usageTracker.costEUR += costEUR;
        
        const percentage = (this.usageTracker.costEUR / this.MAX_BUDGET_EUR) * 100;
        console.log(`[SemanticLabeling] Usage: ${this.usageTracker.tokensUsed} tokens, Cost: €${this.usageTracker.costEUR.toFixed(4)} / €${this.MAX_BUDGET_EUR} (${percentage.toFixed(1)}%)`);
        
        // Persist usage after tracking
        this.persistData().catch(err => {
            console.warn('[SemanticLabeling] Failed to persist usage:', err);
        });
        
        // Warn if approaching budget
        if (this.usageTracker.costEUR > this.MAX_BUDGET_EUR * 0.8) {
            console.warn(`[SemanticLabeling] ⚠️  Budget warning: ${percentage.toFixed(1)}% used. Switching to heuristic labeling.`);
        }
    }

    /**
     * Get current usage statistics
     */
    getUsageStats(): { tokensUsed: number; costEUR: number; budgetRemainingEUR: number } {
        return {
            tokensUsed: this.usageTracker.tokensUsed,
            costEUR: this.usageTracker.costEUR,
            budgetRemainingEUR: this.MAX_BUDGET_EUR - this.usageTracker.costEUR
        };
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; filePath: string } {
        return {
            size: this.labelCache.size,
            filePath: this.cacheFilePath
        };
    }

    /**
     * Generate semantic label with uncertainty information
     * Returns both the label and uncertainty score for active learning
     */
    async generateSemanticLabelWithUncertainty(
        entities: BaseEntity[],
        clusterId: string,
        options: SemanticLabelingOptions = {}
    ): Promise<{ label: string; uncertainty: { score: number; reasons: string[] }; labelingMethod: 'llm' | 'heuristic'; qualityScore?: number }> {
        const {
            language = 'nl',
            domain = 'policy',
            useLLM = this.llmAvailable,
            maxLabelLength = 50
        } = options;

        if (entities.length === 0) {
            return {
                label: 'Lege Cluster',
                uncertainty: { score: 0.5, reasons: ['Empty cluster'] },
                labelingMethod: 'heuristic'
            };
        }

        // Create cache key from entity IDs
        const cacheKey = entities.map(e => e.id).sort().join('|');
        
        // Check cache first
        if (this.labelCache.has(cacheKey)) {
            const cachedLabel = this.labelCache.get(cacheKey)!;
            // Calculate uncertainty for cached label
            const { activeLearningService } = await import('./ActiveLearningService.js');
            const uncertainty = activeLearningService.calculateUncertainty({
                clusterId,
                entities: entities.map(e => ({ id: e.id, name: e.name, type: e.type })),
                label: cachedLabel,
                labelingMethod: 'heuristic', // Cached labels don't track method, assume heuristic
                entityCount: entities.length,
                entityTypes: entities.map(e => e.type),
                domain,
            });
            return {
                label: cachedLabel,
                uncertainty,
                labelingMethod: 'heuristic'
            };
        }

        let label: string;
        let labelingMethod: 'llm' | 'heuristic' = 'heuristic';
        let qualityScore: number | undefined;

        // Check budget before using LLM
        if (useLLM && this.llmAvailable) {
            const estimatedCost = this.estimateCost(this.ESTIMATED_TOKENS_PER_LABEL);
            if (this.usageTracker.costEUR + estimatedCost > this.MAX_BUDGET_EUR) {
                console.warn(`[SemanticLabeling] Budget limit reached (€${this.usageTracker.costEUR.toFixed(2)}), using heuristic labeling`);
                label = this.generateLabelWithHeuristics(entities, { language, domain, maxLabelLength });
                this.setLabelCache(cacheKey, label);
                await this.persistData();
            } else {
                try {
                    label = await this.generateLabelWithLLM(entities, { language, domain });
                    if (label && label.length <= maxLabelLength) {
                        labelingMethod = 'llm';
                        qualityScore = 0.8; // LLM labels generally have higher quality
                        this.setLabelCache(cacheKey, label);
                        await this.persistData();
                    } else {
                        // Fallback to heuristics if LLM label is invalid
                        label = this.generateLabelWithHeuristics(entities, { language, domain, maxLabelLength });
                        this.setLabelCache(cacheKey, label);
                        await this.persistData();
                    }
                } catch (error) {
                    console.warn('[SemanticLabeling] LLM labeling failed, falling back to heuristics:', error);
                    label = this.generateLabelWithHeuristics(entities, { language, domain, maxLabelLength });
                    this.setLabelCache(cacheKey, label);
                    await this.persistData();
                }
            }
        } else {
            // Fallback to heuristic-based labeling
            label = this.generateLabelWithHeuristics(entities, { language, domain, maxLabelLength });
            this.setLabelCache(cacheKey, label);
            await this.persistData();
        }

        // Calculate quality score
        const qualityMetrics = this.calculateQualityScore(label, entities, domain);
        const calculatedQualityScore = qualityScore ?? qualityMetrics.overallScore;

        // Calculate uncertainty
        const { activeLearningService } = await import('./ActiveLearningService.js');
        const uncertainty = activeLearningService.calculateUncertainty({
            clusterId,
            entities: entities.map(e => ({ id: e.id, name: e.name, type: e.type })),
            label,
            labelingMethod,
            qualityScore: calculatedQualityScore,
            entityCount: entities.length,
            entityTypes: entities.map(e => e.type),
            domain,
        });

        return {
            label,
            uncertainty,
            labelingMethod,
            qualityScore: calculatedQualityScore
        };
    }

    /**
     * Calculate quality score for a label
     * Returns scores for relevance, specificity, and domain alignment
     */
    private calculateQualityScore(label: string, entities: BaseEntity[], domain: string): {
        relevanceScore: number;
        specificityScore: number;
        domainAlignmentScore: number;
        overallScore: number;
    } {
        // Relevance score: how well label matches entities (0-1)
        const entityText = entities.map(e => `${e.name} ${e.description || ''}`).join(' ').toLowerCase();
        const labelWords = label.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
        const matchingWords = labelWords.filter(word => {
            if (entityText.includes(word)) return true;
            // Check for compound words
            const wordParts = word.split(/(?=[A-Z])|[-_]/).filter(p => p.length >= 3);
            return wordParts.some(part => entityText.includes(part));
        });
        const relevanceScore = labelWords.length > 0 ? matchingWords.length / labelWords.length : 0;

        // Specificity score: how specific vs generic (0-1)
        const genericLabels = ['cluster', 'label', 'entiteit', 'entity', 'data', 'informatie', 'document', 'regelgeving', 'beleid', 'algemeen', 'overig'];
        const isGeneric = genericLabels.some(generic => label.toLowerCase().includes(generic));
        const wordCount = labelWords.length;
        const avgWordLength = labelWords.reduce((sum, w) => sum + w.length, 0) / (labelWords.length || 1);
        const specificityScore = isGeneric ? 0.2 : Math.min(1.0, (wordCount / 4) * 0.5 + (avgWordLength / 10) * 0.5);

        // Domain alignment score: how well aligned with domain (0-1)
        const domainKeywords = this.getDomainKeywords();
        const domainRelevantWords = labelWords.filter(word => {
            return Array.from(domainKeywords.values()).some(keywords => 
                keywords.some(kw => word.includes(kw) || kw.includes(word))
            );
        });
        const domainAlignmentScore = labelWords.length > 0 ? domainRelevantWords.length / labelWords.length : 0.3;

        // Overall score: weighted average
        const overallScore = (relevanceScore * 0.5 + specificityScore * 0.3 + domainAlignmentScore * 0.2);

        return {
            relevanceScore,
            specificityScore,
            domainAlignmentScore,
            overallScore
        };
    }

    /**
     * Get learning insights and adapt prompts based on feedback
     */
    private async getAdaptedPromptGuidance(domain: string): Promise<string> {
        try {
            const activeLearningService = await this.getActiveLearningService();
            const insights = await activeLearningService.getLearningInsights();
            
            // Build adaptive guidance based on common issues
            const adaptiveGuidance: string[] = [];
            
            if (insights.commonIssues.length > 0) {
                const topIssue = insights.commonIssues[0];
                if (topIssue.issue === 'Low rating' && topIssue.count > 5) {
                    adaptiveGuidance.push('Let op: Eerdere labels kregen lage ratings. Wees extra zorgvuldig en specifiek.');
                }
                if (topIssue.issue === 'Inaccurate label' && topIssue.count > 5) {
                    adaptiveGuidance.push('Let op: Eerdere labels waren onnauwkeurig. Analyseer de entiteiten grondiger voordat je een label genereert.');
                }
                if (topIssue.issue === 'Irrelevant label' && topIssue.count > 5) {
                    adaptiveGuidance.push('Let op: Eerdere labels waren niet relevant. Focus op het hoofdthema van de cluster.');
                }
            }
            
            // Add improvement suggestions
            if (insights.improvementSuggestions.length > 0) {
                adaptiveGuidance.push(`Suggesties: ${insights.improvementSuggestions.slice(0, 2).join('; ')}`);
            }
            
            return adaptiveGuidance.length > 0 ? adaptiveGuidance.join('\n') + '\n' : '';
        } catch (error) {
            // If learning insights are not available, return empty string
            return '';
        }
    }

    /**
     * Generate label using LLM (OpenAI or Anthropic)
     */
    private async generateLabelWithLLM(
        entities: BaseEntity[],
        options: { language: 'nl' | 'en'; domain: string }
    ): Promise<string> {
        // Extract text content from entities
        const texts = entities.map(e => {
            let text = e.name;
            if (e.description) {
                text += `: ${e.description}`;
            }
            // Add type-specific information
            if (e.type === 'Regulation') {
                const regulation = e as Regulation;
                if (regulation.category) {
                    text += ` (${regulation.category})`;
                }
            }
            if (e.type === 'SpatialUnit') {
                const spatialUnit = e as SpatialUnit;
                if (spatialUnit.spatialType) {
                    text += ` (${spatialUnit.spatialType})`;
                }
            }
            if (e.type === 'LandUse') {
                const landUse = e as LandUse;
                if (landUse.category) {
                    text += ` (${landUse.category})`;
                }
            }
            return text;
        });

        // Generate summary
        const summary = this.generateSummary(texts);

        // Create prompt with enhanced context including entity type distribution
        const prompt = await this.createLabelingPrompt(summary, options, entities);

        // Call LLM API with retry logic
        if (process.env.OPENAI_API_KEY) {
            try {
                const label = await this.callOpenAI(prompt);
                // Validate label quality before returning
                if (this.validateLabelQuality(label, entities)) {
                    return label;
                } else {
                    console.warn('[SemanticLabeling] Label quality validation failed, falling back to heuristics');
                    throw new Error('Label quality validation failed');
                }
            } catch (error: unknown) {
                // If rate limit or other error, fall back to heuristics
                const errorObj = error as { message?: string; status?: number };
                if (errorObj?.message?.includes('rate limit') || errorObj?.status === 429) {
                    console.warn('[SemanticLabeling] Rate limit hit, falling back to heuristics');
                    throw error; // WillFallbackToHeuristics');
                }
                throw error;
            }
        } else if (process.env.ANTHROPIC_API_KEY) {
            const label = await this.callAnthropic(prompt);
            // Validate label quality before returning
            if (this.validateLabelQuality(label, entities)) {
                return label;
            } else {
                console.warn('[SemanticLabeling] Label quality validation failed, falling back to heuristics');
                throw new Error('Label quality validation failed');
            }
        } else {
            throw new Error('No LLM API key configured');
        }
    }

    /**
     * Generate label using heuristics (content analysis)
     */
    private generateLabelWithHeuristics(
        entities: BaseEntity[],
        options: { language: 'nl' | 'en'; domain: string; maxLabelLength: number }
    ): string {
        const { language, maxLabelLength } = options;

        // Extract keywords from entity names and descriptions
        const keywords = this.extractKeywords(entities);
        
        // Find most common theme
        const theme = this.identifyTheme(keywords, language);
        
        // Generate label from theme
        const label = this.formatLabel(theme, language, maxLabelLength);
        
        return label || this.getFallbackLabel(entities, language);
    }

    /**
     * Extract keywords from entities (enhanced with better filtering and compound word support)
     */
    private extractKeywords(entities: BaseEntity[]): Map<string, number> {
        const keywordCounts = new Map<string, number>();
        
        // Dutch policy domain keywords (expanded)
        const domainKeywords: Record<string, string[]> = {
            'bodem': ['bodem', 'grond', 'verontreiniging', 'kwaliteit', 'sanering', 'bodemkwaliteit', 'grondwater', 'bodemverontreiniging'],
            'water': ['water', 'waterkwaliteit', 'oppervlaktewater', 'grondwater', 'riool', 'waterbeheer', 'waterkering', 'afvalwater'],
            'lucht': ['lucht', 'luchtkwaliteit', 'emissie', 'uitstoot', 'fijnstof', 'luchtverontreiniging', 'luchtemissie'],
            'geluid': ['geluid', 'lawaai', 'decibel', 'dB', 'geluidsoverlast', 'geluidsnorm', 'geluidsniveau'],
            'natuur': ['natuur', 'biodiversiteit', 'habitat', 'ecologie', 'flora', 'fauna', 'natuurgebied', 'natuurbeheer'],
            'wonen': ['wonen', 'woonbestemming', 'woongebied', 'woning', 'huisvesting', 'woonruimte', 'woonwijk'],
            'bedrijf': ['bedrijf', 'bedrijvigheid', 'industrie', 'kantoor', 'werkgelegenheid', 'bedrijventerrein', 'bedrijfsruimte'],
            'verkeer': ['verkeer', 'vervoer', 'mobiliteit', 'weg', 'infrastructuur', 'verkeersinfrastructuur', 'verkeersplanning'],
            'energie': ['energie', 'duurzaam', 'zonnepanelen', 'windenergie', 'isolatie', 'energiebesparing', 'duurzame-energie'],
            'afval': ['afval', 'afvalverwerking', 'recycling', 'afvalstoffen', 'afvalbeheer', 'afvalinzameling']
        };

        // Common Dutch stop words (expanded)
        const stopWords = new Set([
            'de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'is', 'zijn', 'was', 'waren',
            'en', 'of', 'te', 'bij', 'als', 'dat', 'die', 'dit', 'deze', 'die', 'zijn', 'haar', 'hun',
            'om', 'tot', 'naar', 'over', 'onder', 'tussen', 'door', 'tijdens', 'volgens', 'zonder'
        ]);

        entities.forEach(entity => {
            const text = `${entity.name} ${entity.description || ''}`.toLowerCase();
            
            // Check for domain keywords (including compound words)
            for (const [domain, keywords] of Object.entries(domainKeywords)) {
                keywords.forEach(keyword => {
                    // Check for exact match or as part of compound word
                    if (text.includes(keyword)) {
                        keywordCounts.set(domain, (keywordCounts.get(domain) || 0) + 1);
                    }
                });
            }
            
            // Extract significant words with better filtering
            // Support compound words by splitting on common separators
            const normalizedText = text.replace(/[-_]/g, ' ');
            const words = normalizedText
                .split(/\s+/)
                .map(w => w.replace(/[^\w]/g, '')) // Remove punctuation
                .filter(w => 
                    w.length >= 3 && 
                    !stopWords.has(w) &&
                    !/^\d+$/.test(w) // Exclude pure numbers
                );
            
            words.forEach(word => {
                keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
            });
        });

        return keywordCounts;
    }

    /**
     * Identify main theme from keywords
     * Enhanced with multi-theme support and better ranking
     */
    private identifyTheme(keywords: Map<string, number>, _language: 'nl' | 'en'): string {
        // Sort by frequency
        const sorted = Array.from(keywords.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Consider top 10 for better theme detection

        if (sorted.length === 0) {
            return '';
        }

        // Expanded domain keyword mapping with more specific labels
        const domainKeywords: Record<string, string> = {
            'bodem': 'Bodemkwaliteit',
            'water': 'Waterkwaliteit',
            'lucht': 'Luchtkwaliteit',
            'geluid': 'Geluidnormen',
            'natuur': 'Natuur en Biodiversiteit',
            'wonen': 'Woonbestemmingen',
            'bedrijf': 'Bedrijvigheid',
            'verkeer': 'Verkeer en Mobiliteit',
            'energie': 'Energie en Duurzaamheid',
            'afval': 'Afvalbeheer',
            'ruimtelijk': 'Ruimtelijke Ordening',
            'milieu': 'Milieukwaliteit',
            'cultuur': 'Cultuurhistorie',
            'recreatie': 'Recreatie'
        };

        // Check for domain matches first (prioritize domain keywords)
        const domainMatches: Array<[string, number]> = [];
        for (const [domain, label] of Object.entries(domainKeywords)) {
            const match = sorted.find(([key]) => key === domain);
            if (match) {
                domainMatches.push([label, match[1]]);
            }
        }

        // If we have domain matches, use the most frequent one
        if (domainMatches.length > 0) {
            domainMatches.sort((a, b) => b[1] - a[1]);
            const topDomain = domainMatches[0][0];
            
            // If there's a strong second theme, combine them
            if (domainMatches.length > 1 && domainMatches[1][1] >= domainMatches[0][1] * 0.6) {
                return `${topDomain} en ${domainMatches[1][0]}`;
            }
            
            return topDomain;
        }

        // Use top keyword, capitalize and format
        const topKeyword = sorted[0][0];
        // Capitalize first letter and handle compound words
        const formatted = topKeyword
            .split(/(?=[A-Z])|[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        
        return formatted;
    }

    /**
     * Format label according to language and length constraints
     */
    private formatLabel(theme: string, _language: 'nl' | 'en', maxLength: number): string {
        if (!theme) return '';
        
        // Truncate if too long
        if (theme.length > maxLength) {
            return theme.substring(0, maxLength - 3) + '...';
        }
        
        return theme;
    }

    /**
     * Validate label quality to ensure meaningful labels
     * Enhanced with more sophisticated rules and semantic relevance checking
     */
    private validateLabelQuality(label: string, entities: BaseEntity[]): boolean {
        if (!label || label.trim().length === 0) {
            return false;
        }

        const trimmedLabel = label.trim();

        // Filter out generic or low-quality labels (expanded list)
        const genericLabels = [
            'cluster', 'label', 'entiteit', 'entity', 'data', 'informatie',
            'document', 'regelgeving', 'beleid', 'algemeen', 'overig', 'items',
            'groep', 'group', 'categorie', 'category', 'type', 'soort', 'kind',
            'element', 'item', 'object', 'onderwerp', 'subject', 'thema', 'theme'
        ];
        
        const lowerLabel = trimmedLabel.toLowerCase();
        // Check for exact matches or generic labels in short labels
        if (genericLabels.some(generic => {
            const exactMatch = lowerLabel === generic;
            const containsGeneric = lowerLabel.includes(generic) && trimmedLabel.length < 15;
            const startsWithGeneric = lowerLabel.startsWith(generic + ' ') && trimmedLabel.length < 20;
            return exactMatch || containsGeneric || startsWithGeneric;
        })) {
            return false;
        }

        // Ensure label has minimum length (at least 3 characters)
        if (trimmedLabel.length < 3) {
            return false;
        }

        // Ensure label is not just numbers or special characters
        if (/^[\d\s\-_]+$/.test(trimmedLabel)) {
            return false;
        }

        // Enhanced semantic relevance checking
        const entityText = entities.map(e => `${e.name} ${e.description || ''}`).join(' ').toLowerCase();
        const labelWords = lowerLabel.split(/\s+/).filter(w => w.length >= 3);
        
        // Check for word overlap (improved matching)
        const hasRelevance = labelWords.some(word => {
            // Exact word match
            if (entityText.includes(word)) return true;
            // Check for compound words (e.g., "bodemkwaliteit" contains "bodem")
            const wordParts = word.split(/(?=[A-Z])|[-_]/).filter(p => p.length >= 3);
            return wordParts.some(part => entityText.includes(part));
        });

        // Check for domain keyword relevance
        const domainKeywords = this.getDomainKeywords();
        const hasDomainRelevance = labelWords.some(word => {
            return Array.from(domainKeywords.values()).some(keywords => 
                keywords.some(kw => word.includes(kw) || kw.includes(word))
            );
        });

        // If label is very short and has no relevance, it's likely low quality
        if (trimmedLabel.length < 10 && !hasRelevance && !hasDomainRelevance) {
            return false;
        }

        // Check for meaningful content (at least one word with 4+ characters)
        const meaningfulWords = labelWords.filter(w => w.length >= 4);
        if (meaningfulWords.length === 0) {
            return false;
        }

        // Reject labels that are just common words
        const commonWords = ['de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'en', 'of', 'te', 'bij'];
        if (labelWords.length === 1 && commonWords.includes(labelWords[0])) {
            return false;
        }

        return true;
    }

    /**
     * Get domain keywords for relevance checking
     */
    private getDomainKeywords(): Map<string, string[]> {
        return new Map([
            ['bodem', ['bodem', 'grond', 'verontreiniging', 'kwaliteit', 'sanering', 'bodemkwaliteit', 'grondwater', 'bodemverontreiniging']],
            ['water', ['water', 'waterkwaliteit', 'oppervlaktewater', 'grondwater', 'riool', 'waterbeheer', 'waterkering', 'afvalwater']],
            ['lucht', ['lucht', 'luchtkwaliteit', 'emissie', 'uitstoot', 'fijnstof', 'luchtverontreiniging', 'luchtemissie']],
            ['geluid', ['geluid', 'lawaai', 'decibel', 'dB', 'geluidsoverlast', 'geluidsnorm', 'geluidsniveau']],
            ['natuur', ['natuur', 'biodiversiteit', 'habitat', 'ecologie', 'flora', 'fauna', 'natuurgebied', 'natuurbeheer']],
            ['wonen', ['wonen', 'woonbestemming', 'woongebied', 'woning', 'huisvesting', 'woonruimte', 'woonwijk']],
            ['bedrijf', ['bedrijf', 'bedrijvigheid', 'industrie', 'kantoor', 'werkgelegenheid', 'bedrijventerrein', 'bedrijfsruimte']],
            ['verkeer', ['verkeer', 'vervoer', 'mobiliteit', 'weg', 'infrastructuur', 'verkeersinfrastructuur', 'verkeersplanning']],
            ['energie', ['energie', 'duurzaam', 'zonnepanelen', 'windenergie', 'isolatie', 'energiebesparing', 'duurzame-energie']],
            ['afval', ['afval', 'afvalverwerking', 'recycling', 'afvalstoffen', 'afvalbeheer', 'afvalinzameling']]
        ]);
    }

    /**
     * Validate label quality and filter out low-quality labels (legacy method for heuristics)
     */
    private validateLabel(label: string): string {
        if (!label || label.length < 2) {
            return '';
        }

        // Filter out generic or low-quality labels
        const genericLabels = [
            'cluster', 'label', 'entiteit', 'entity', 'data', 'informatie',
            'document', 'regelgeving', 'beleid', 'algemeen', 'overig'
        ];
        
        const lowerLabel = label.toLowerCase();
        if (genericLabels.some(generic => lowerLabel === generic || lowerLabel.startsWith(generic + ' '))) {
            return ''; // Return empty to trigger fallback
        }

        // Ensure label is not too generic (single common word)
        const commonWords = ['de', 'het', 'een', 'van', 'voor', 'met'];
        const words = label.split(/\s+/);
        if (words.length === 1 && commonWords.includes(words[0].toLowerCase())) {
            return ''; // Return empty to trigger fallback
        }

        return label;
    }

    /**
     * Fallback label generation (enhanced with better descriptions)
     */
    private getFallbackLabel(entities: BaseEntity[], language: 'nl' | 'en'): string {
        if (entities.length === 0) {
            return language === 'nl' ? 'Lege Cluster' : 'Empty Cluster';
        }

        // Try to extract a meaningful keyword first
        const keywords = this.extractKeywords(entities);
        const sortedKeywords = Array.from(keywords.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        // If we have meaningful keywords, use them
        if (sortedKeywords.length > 0 && sortedKeywords[0][1] >= 2) {
            const topKeyword = sortedKeywords[0][0];
            const domainKeywords: Record<string, { nl: string; en: string }> = {
                'bodem': { nl: 'Bodemkwaliteit', en: 'Soil Quality' },
                'water': { nl: 'Waterkwaliteit', en: 'Water Quality' },
                'lucht': { nl: 'Luchtkwaliteit', en: 'Air Quality' },
                'geluid': { nl: 'Geluidnormen', en: 'Noise Standards' },
                'natuur': { nl: 'Natuur en Biodiversiteit', en: 'Nature and Biodiversity' },
                'wonen': { nl: 'Woonbestemmingen', en: 'Residential Zoning' },
                'bedrijf': { nl: 'Bedrijvigheid', en: 'Business Activity' },
                'verkeer': { nl: 'Verkeer en Mobiliteit', en: 'Traffic and Mobility' },
                'energie': { nl: 'Energie en Duurzaamheid', en: 'Energy and Sustainability' },
                'afval': { nl: 'Afvalbeheer', en: 'Waste Management' }
            };

            if (domainKeywords[topKeyword]) {
                return domainKeywords[topKeyword][language];
            }

            // Use capitalized keyword
            const capitalized = topKeyword.charAt(0).toUpperCase() + topKeyword.slice(1);
            return capitalized;
        }

        // Group by entity type as fallback
        const typeCounts = new Map<string, number>();
        entities.forEach(e => {
            typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
        });

        const dominantType = Array.from(typeCounts.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0];

        const typeLabels: Record<string, { nl: string; en: string }> = {
            'PolicyDocument': { nl: 'Beleidsdocumenten', en: 'Policy Documents' },
            'Regulation': { nl: 'Regelgeving', en: 'Regulations' },
            'SpatialUnit': { nl: 'Ruimtelijke Eenheden', en: 'Spatial Units' },
            'LandUse': { nl: 'Gebruiksfuncties', en: 'Land Uses' },
            'Requirement': { nl: 'Eisen', en: 'Requirements' },
            'Concept': { nl: 'Concepten', en: 'Concepts' }
        };

        const label = typeLabels[dominantType || 'Concept']?.[language] || 'Cluster';
        
        // Only add count if it provides value (multiple types or large cluster)
        if (typeCounts.size > 1 || entities.length > 5) {
            return `${label} (${entities.length})`;
        }
        
        return label;
    }

    /**
     * Generate summary from entity texts (optimized for token efficiency)
     * Enhanced: Now uses up to 20 entities and better summarization
     */
    private generateSummary(texts: string[]): string {
        // Increased from 10 to 20 entities for better context
        const limitedTexts = texts.slice(0, 20);
        
        // Better summarization: prioritize longer, more descriptive texts
        const sortedTexts = limitedTexts.sort((a, b) => b.length - a.length);
        
        // Combine with smart truncation: prioritize first entities
        let combined = '';
        for (const text of sortedTexts) {
            const remaining = 500 - combined.length; // Increased from 300 to 500 chars
            if (remaining <= 0) break;
            if (combined) combined += '; ';
            combined += text.substring(0, remaining);
        }
        
        return combined || sortedTexts[0]?.substring(0, 500) || '';
    }

    /**
     * Create LLM prompt for labeling (enhanced with better examples and context)
     */
    private async createLabelingPrompt(
        summary: string,
        options: { language: 'nl' | 'en'; domain: string },
        entities: BaseEntity[]
    ): Promise<string> {
        // Increased context window from 300 to 500 chars for better quality
        const truncatedSummary = summary.substring(0, 500);
        
        // Get entity type distribution for better context
        const typeDistribution = this.getEntityTypeDistribution(entities);
        
        // Get key themes from entities for better context
        const keyThemes = this.extractKeyThemes(entities);
        
        // Enhanced prompt with few-shot examples and domain-specific guidance
        const domainGuidance = this.getDomainGuidance(options.domain);
        const examples = this.getFewShotExamples(options.domain);
        const templates = this.getDomainTemplates(options.domain);
        
        // Get adaptive guidance from learning insights
        const adaptiveGuidance = await this.getAdaptedPromptGuidance(options.domain);
        
        return `Je bent een expert in Nederlandse ruimtelijke ordening en beleid. Genereer een semantisch label voor een cluster van gerelateerde entiteiten.

Cluster context: ${truncatedSummary}

Entity types: ${typeDistribution || 'Mixed'}
${keyThemes ? `Key themes: ${keyThemes}` : ''}

${domainGuidance}

${adaptiveGuidance ? `Aanpassingen gebaseerd op feedback:\n${adaptiveGuidance}\n` : ''}

${templates ? `Label templates voor dit domein:\n${templates}\n` : ''}

Voorbeelden van goede labels:
${examples}

Regels:
- Gebruik 2-4 woorden
- Gebruik Nederlandse terminologie
- Wees specifiek en beschrijvend
- Vermijd generieke termen zoals "Cluster", "Regelgeving", "Beleid", "Algemeen"
- Focus op het hoofdthema van de cluster
- Gebruik domein-specifieke termen waar mogelijk

Label:`;
    }

    /**
     * Extract entity type distribution for better context
     */
    private getEntityTypeDistribution(entities: BaseEntity[]): string {
        const typeCounts = new Map<string, number>();
        entities.forEach(e => {
            typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
        });
        
        const sorted = Array.from(typeCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        
        if (sorted.length === 0) return '';
        
        return sorted.map(([type, count]) => `${type}:${count}`).join(', ');
    }

    /**
     * Get few-shot examples for better label generation
     */
    private getFewShotExamples(domain: string): string {
        const examples: Record<string, string[]> = {
            'policy': [
                '- Cluster over bodemkwaliteit en verontreiniging → "Bodemkwaliteit"',
                '- Cluster over woonbestemmingen en huisvesting → "Woonbestemmingen"',
                '- Cluster over geluidsnormen en decibels → "Geluidnormen"',
                '- Cluster over waterkwaliteit en oppervlaktewater → "Waterkwaliteit"',
                '- Cluster over natuur en biodiversiteit → "Natuur en Biodiversiteit"',
                '- Cluster over omgevingsvisie en bestemmingsplan → "Ruimtelijke Planning"'
            ],
            'spatial': [
                '- Cluster over woonzone, industriezone, groenzone → "Ruimtelijke Zonering"',
                '- Cluster over centrumgebied, buitengebied → "Gebiedstypen"',
                '- Cluster over verkeerszone, parkeerzone → "Verkeerszones"'
            ],
            'environmental': [
                '- Cluster over luchtkwaliteit, emissie, uitstoot → "Luchtkwaliteit"',
                '- Cluster over geluid, decibel, geluidsoverlast → "Geluidnormen"',
                '- Cluster over natuur, biodiversiteit, habitat → "Natuur en Biodiversiteit"'
            ]
        };
        
        return examples[domain]?.join('\n') || examples['policy'].join('\n');
    }

    /**
     * Extract key themes from entities for better prompt context
     */
    private extractKeyThemes(entities: BaseEntity[]): string {
        const keywords = this.extractKeywords(entities);
        const topKeywords = Array.from(keywords.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([key]) => key);
        
        return topKeywords.length > 0 ? topKeywords.join(', ') : '';
    }

    /**
     * Get domain-specific guidance for prompts
     */
    private getDomainGuidance(domain: string): string {
        const guidance: Record<string, string> = {
            'policy': 'Focus op beleidstermen en regelgeving.',
            'spatial': 'Focus op ruimtelijke eenheden en bestemmingen.',
            'environmental': 'Focus op milieu, natuur en duurzaamheid.'
        };
        return guidance[domain] || 'Focus op de belangrijkste thema\'s in de cluster.';
    }

    /**
     * Get domain-specific label templates
     */
    private getDomainTemplates(domain: string): string {
        const templates: Record<string, string[]> = {
            'policy': [
                '- "[Thema]kwaliteit" voor kwaliteitsgerelateerde clusters (bijv. "Bodemkwaliteit", "Waterkwaliteit")',
                '- "[Thema]normen" voor normen en standaarden (bijv. "Geluidnormen", "Emissienormen")',
                '- "[Thema]bestemmingen" voor bestemmingsgerelateerde clusters (bijv. "Woonbestemmingen", "Bedrijfsbestemmingen")',
                '- "[Thema] en [Thema]" voor multi-thema clusters (bijv. "Natuur en Biodiversiteit", "Verkeer en Mobiliteit")'
            ],
            'spatial': [
                '- "[Type] Zonering" voor ruimtelijke zones (bijv. "Woonzonering", "Industriezonering")',
                '- "[Gebied] Typen" voor gebiedstypen (bijv. "Centrumgebied Typen", "Buitengebied Typen")',
                '- "[Functie] Zones" voor functionele zones (bijv. "Verkeerszones", "Parkeerzones")'
            ],
            'environmental': [
                '- "[Medium]kwaliteit" voor milieu-kwaliteit (bijv. "Luchtkwaliteit", "Waterkwaliteit")',
                '- "[Aspect] Normen" voor normen (bijv. "Geluidnormen", "Emissienormen")',
                '- "[Thema] en [Thema]" voor gerelateerde thema\'s (bijv. "Natuur en Biodiversiteit")'
            ]
        };
        
        return templates[domain]?.join('\n') || '';
    }

    /**
     * Call OpenAI API with cost tracking and rate limit handling
     */
    private async callOpenAI(prompt: string, retryCount: number = 0): Promise<string> {
        const OpenAI = await import('openai');
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set');
        }
        const openai = new OpenAI.default({
            apiKey
        });

        // Use cheapest model
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const MAX_RETRIES = 3;
        const INITIAL_RETRY_DELAY = 1000; // 1 second
        
        try {
            const response = await openai.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a Dutch policy expert. Generate concise semantic labels for knowledge graph clusters.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 20 // Very short to minimize cost
            });

            // Track usage
            const inputTokens = response.usage?.prompt_tokens || 0;
            const outputTokens = response.usage?.completion_tokens || 0;
            this.trackUsage(inputTokens, outputTokens);

            const label = response.choices[0]?.message?.content?.trim();
            if (!label) {
                throw new Error('No label generated');
            }
            
            // Clean up label (remove quotes, extra text) and validate quality
            let cleanedLabel = label.replace(/^["']|["']$/g, '').split('\n')[0].trim();
            cleanedLabel = this.validateLabel(cleanedLabel);
            
            return cleanedLabel;
        } catch (error: unknown) {
            // Handle rate limits with exponential backoff
            const errorObj = error as { status?: number; message?: string };
            if (errorObj?.status === 429 || errorObj?.message?.includes('rate limit')) {
                if (retryCount < MAX_RETRIES) {
                    const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
                    console.warn(`[SemanticLabeling] Rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.callOpenAI(prompt, retryCount + 1);
                } else {
                    console.error('[SemanticLabeling] Rate limit exceeded after retries, falling back to heuristics');
                    throw new Error('Rate limit exceeded');
                }
            }
            
            // Re-throw other errors
            throw error;
        }
    }

    /**
     * Call Anthropic API
     */
    private async callAnthropic(prompt: string): Promise<string> {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not set');
        }

        // Dynamic import for optional dependency
        let AnthropicSdk: any;
        try {
            // @ts-expect-error - @anthropic-ai/sdk is an optional dependency
            AnthropicSdk = await import('@anthropic-ai/sdk');
        } catch {
            throw new Error('Anthropic SDK is not installed');
        }

        const AnthropicClient = AnthropicSdk.default ?? AnthropicSdk;
        const anthropic = new AnthropicClient({ apiKey });

        const response = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
            max_tokens: 20,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        const firstContent = response.content[0];
        const label = firstContent && 'type' in firstContent && firstContent.type === 'text' && 'text' in firstContent
            ? firstContent.text.trim()
            : null;
            
        if (!label) {
            throw new Error('No label generated');
        }
        
        // Clean up label
        return label.replace(/^["']|["']$/g, '').split('\n')[0].trim();
    }

    // ============================================================================
    // Hierarchical Label Methods
    // ============================================================================

    /**
     * Generate a hierarchical label for a cluster of entities.
     * Creates a label with parent-child relationship support.
     * 
     * @param entities Array of entities in the cluster
     * @param options Hierarchical labeling options
     * @returns Hierarchical label with hierarchy information
     */
    async generateHierarchicalLabel(
        entities: BaseEntity[],
        options: HierarchicalLabelingOptions = {}
    ): Promise<HierarchicalLabel> {
        const {
            language = 'nl',
            domain = 'policy',
            useLLM = this.llmAvailable,
            maxLabelLength = 50,
            parentLabel,
            buildHierarchy = false,
            maxLevels = 3
        } = options;

        if (entities.length === 0) {
            const emptyId = 'hier-empty';
            return {
                id: emptyId,
                label: language === 'nl' ? 'Lege Cluster' : 'Empty Cluster',
                level: 0,
                childrenIds: [],
                entityIds: []
            };
        }

        // Create cache key from entity IDs and parent label
        const cacheKey = `hier:${entities.map(e => e.id).sort().join('|')}:${parentLabel || ''}`;
        
        // Check hierarchical cache first
        if (this.hierarchicalLabelCache.has(cacheKey)) {
            return this.hierarchicalLabelCache.get(cacheKey)!;
        }

        // Generate flat label first
        const flatLabel = await this.generateSemanticLabel(entities, {
            language,
            domain,
            useLLM,
            maxLabelLength
        });

        // Infer hierarchy level and parent from domain keywords
        const domainMapping = this.inferDomainMapping(flatLabel, language);
        const level = parentLabel ? (domainMapping.level + 1) : domainMapping.level;

        // Generate hierarchical label ID
        const labelId = `hier-${level}-${entities.map(e => e.id).sort().join('-').substring(0, 32)}`;

        const hierarchicalLabel: HierarchicalLabel = {
            id: labelId,
            label: flatLabel,
            level,
            parentId: parentLabel && domainMapping.parentDomain ? this.findParentLabelId(domainMapping.parentDomain, language) : undefined,
            childrenIds: [],
            entityIds: entities.map(e => e.id)
        };

        // Cache and persist
        this.setHierarchicalLabelCache(cacheKey, hierarchicalLabel);
        await this.persistData();

        // If buildHierarchy is true, automatically build hierarchy from existing labels
        if (buildHierarchy) {
            await this.buildHierarchicalStructure(maxLevels);
        }

        return hierarchicalLabel;
    }

    /**
     * Build hierarchical structure from existing flat labels.
     * Groups labels by domain and creates parent-child relationships.
     * 
     * @param maxLevels Maximum hierarchy depth (default: 3)
     * @returns Map of label ID to hierarchical label
     */
    async buildHierarchicalStructure(maxLevels: number = 3): Promise<Map<string, HierarchicalLabel>> {
        const hierarchy = new Map<string, HierarchicalLabel>();

        // Domain hierarchy mapping (Dutch policy domains)
        const domainHierarchy: Record<string, { parent?: string; level: number }> = {
            'Bodemkwaliteit': { parent: 'Milieu', level: 1 },
            'Waterkwaliteit': { parent: 'Milieu', level: 1 },
            'Luchtkwaliteit': { parent: 'Milieu', level: 1 },
            'Geluidnormen': { parent: 'Milieu', level: 1 },
            'Natuur en Biodiversiteit': { parent: 'Milieu', level: 1 },
            'Afvalbeheer': { parent: 'Milieu', level: 1 },
            'Woonbestemmingen': { parent: 'Ruimtelijke Ordening', level: 1 },
            'Bedrijvigheid': { parent: 'Ruimtelijke Ordening', level: 1 },
            'Verkeer en Mobiliteit': { parent: 'Ruimtelijke Ordening', level: 1 },
            'Energie en Duurzaamheid': { parent: 'Ruimtelijke Ordening', level: 1 },
            'Milieu': { level: 0 },
            'Ruimtelijke Ordening': { level: 0 }
        };

        // Get all flat labels and create hierarchical structure
        const flatLabels = Array.from(this.labelCache.entries());
        
        for (const [cacheKey, labelText] of flatLabels) {
            const domainInfo = domainHierarchy[labelText];
            if (!domainInfo) continue;

            const labelId = `hier-${domainInfo.level}-${cacheKey.substring(0, 32)}`;
            const parentId = domainInfo.parent ? this.findParentLabelId(domainInfo.parent, 'nl') : undefined;

            const hierarchicalLabel: HierarchicalLabel = {
                id: labelId,
                label: labelText,
                level: domainInfo.level,
                parentId,
                childrenIds: [],
                entityIds: [] // Would need entity mapping from cache key
            };

            hierarchy.set(labelId, hierarchicalLabel);

            // Update parent's children array
            if (parentId && hierarchy.has(parentId)) {
                const parent = hierarchy.get(parentId)!;
                if (!parent.childrenIds.includes(labelId)) {
                    parent.childrenIds.push(labelId);
                }
            }
        }

        // Update hierarchical cache
        for (const [id, label] of hierarchy.entries()) {
            this.setHierarchicalLabelCache(id, label);
        }

        await this.persistData();
        return hierarchy;
    }

    /**
     * Get hierarchical label by ID
     */
    getHierarchicalLabel(labelId: string): HierarchicalLabel | undefined {
        return this.hierarchicalLabelCache.get(labelId);
    }

    /**
     * Get all ancestor labels (parents up to root)
     */
    getLabelAncestors(labelId: string): HierarchicalLabel[] {
        const ancestors: HierarchicalLabel[] = [];
        let currentId: string | undefined = labelId;

        while (currentId) {
            const label = this.hierarchicalLabelCache.get(currentId);
            if (!label) break;

            if (label.parentId) {
                const parent = this.hierarchicalLabelCache.get(label.parentId);
                if (parent) {
                    ancestors.unshift(parent);
                    currentId = label.parentId;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        return ancestors;
    }

    /**
     * Get all descendant labels (children recursively)
     */
    getLabelDescendants(labelId: string): HierarchicalLabel[] {
        const descendants: HierarchicalLabel[] = [];
        const label = this.hierarchicalLabelCache.get(labelId);
        
        if (!label) return descendants;

        const collectChildren = (id: string) => {
            const childLabel = this.hierarchicalLabelCache.get(id);
            if (!childLabel) return;

            descendants.push(childLabel);
            for (const childId of childLabel.childrenIds) {
                collectChildren(childId);
            }
        };

        for (const childId of label.childrenIds) {
            collectChildren(childId);
        }

        return descendants;
    }

    /**
     * Infer domain mapping from label text
     */
    private inferDomainMapping(label: string, language: 'nl' | 'en'): { level: number; parentDomain?: string } {
        const labelLower = label.toLowerCase();

        // Level 1 labels (child of domain categories)
        const level1Domains: Record<string, string> = {
            'bodem': 'Milieu',
            'water': 'Milieu',
            'lucht': 'Milieu',
            'geluid': 'Milieu',
            'natuur': 'Milieu',
            'afval': 'Milieu',
            'wonen': 'Ruimtelijke Ordening',
            'woon': 'Ruimtelijke Ordening',
            'bedrijf': 'Ruimtelijke Ordening',
            'verkeer': 'Ruimtelijke Ordening',
            'mobiliteit': 'Ruimtelijke Ordening',
            'energie': 'Ruimtelijke Ordening',
            'duurzaam': 'Ruimtelijke Ordening'
        };

        for (const [keyword, parent] of Object.entries(level1Domains)) {
            if (labelLower.includes(keyword)) {
                return { level: 1, parentDomain: parent };
            }
        }

        // Level 0 labels (root categories)
        if (labelLower.includes('milieu') || labelLower.includes('ruimtelijk') || labelLower.includes('omgeving')) {
            return { level: 0 };
        }

        // Default to level 1 with Milieu as parent
        return { level: 1, parentDomain: 'Milieu' };
    }

    /**
     * Find parent label ID by domain name
     */
    private findParentLabelId(domainName: string, language: 'nl' | 'en'): string | undefined {
        for (const [id, label] of this.hierarchicalLabelCache.entries()) {
            if (label.label === domainName && label.level === 0) {
                return id;
            }
        }

        // Create parent label if it doesn't exist
        const parentId = `hier-0-${domainName.toLowerCase().replace(/\s+/g, '-')}`;
        const parentLabel: HierarchicalLabel = {
            id: parentId,
            label: domainName,
            level: 0,
            childrenIds: [],
            entityIds: []
        };

        this.setHierarchicalLabelCache(parentId, parentLabel);
        return parentId;
    }

    /**
     * Get all root labels (level 0)
     */
    getRootLabels(): HierarchicalLabel[] {
        return Array.from(this.hierarchicalLabelCache.values()).filter(label => label.level === 0);
    }

    /**
     * Get full path from root to label (array of labels from root to current)
     */
    getLabelPath(labelId: string): HierarchicalLabel[] {
        const path: HierarchicalLabel[] = [];
        const ancestors = this.getLabelAncestors(labelId);
        const currentLabel = this.hierarchicalLabelCache.get(labelId);
        
        // Add ancestors (from root to parent)
        path.push(...ancestors);
        
        // Add current label
        if (currentLabel) {
            path.push(currentLabel);
        }
        
        return path;
    }

    /**
     * Get subtree starting from a label (label + all descendants)
     */
    getLabelTree(labelId: string): HierarchicalLabel[] {
        const tree: HierarchicalLabel[] = [];
        const rootLabel = this.hierarchicalLabelCache.get(labelId);
        
        if (!rootLabel) return tree;
        
        tree.push(rootLabel);
        
        // Recursively add all descendants
        const descendants = this.getLabelDescendants(labelId);
        tree.push(...descendants);
        
        return tree;
    }

    /**
     * Get all labels at a specific level
     */
    getLabelsByLevel(level: number): HierarchicalLabel[] {
        return Array.from(this.hierarchicalLabelCache.values()).filter(label => label.level === level);
    }

    /**
     * Get all labels with a specific parent ID
     */
    getLabelsByParent(parentId: string): HierarchicalLabel[] {
        return Array.from(this.hierarchicalLabelCache.values()).filter(label => label.parentId === parentId);
    }

    /**
     * Update parent-child relationship in hierarchy
     */
    async updateHierarchy(
        labelId: string,
        updates: {
            parentId?: string | null;
            childrenIds?: string[];
        }
    ): Promise<HierarchicalLabel> {
        const label = this.hierarchicalLabelCache.get(labelId);
        if (!label) {
            throw new Error(`Label with ID ${labelId} not found`);
        }

        // Update parent relationship
        if (updates.parentId !== undefined) {
            // Remove from old parent's children
            if (label.parentId) {
                const oldParent = this.hierarchicalLabelCache.get(label.parentId);
                if (oldParent) {
                    oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== labelId);
                    this.setHierarchicalLabelCache(label.parentId, oldParent);
                }
            }

            // Set new parent
            if (updates.parentId === null) {
                label.parentId = undefined;
                label.level = 0;
            } else {
                const newParent = this.hierarchicalLabelCache.get(updates.parentId);
                if (!newParent) {
                    throw new Error(`Parent label with ID ${updates.parentId} not found`);
                }
                label.parentId = updates.parentId;
                label.level = newParent.level + 1;
                
                // Add to new parent's children
                if (!newParent.childrenIds.includes(labelId)) {
                    newParent.childrenIds.push(labelId);
                    this.setHierarchicalLabelCache(updates.parentId, newParent);
                }
            }
        }

        // Update children relationships
        if (updates.childrenIds !== undefined) {
            // Remove from old children's parents
            for (const oldChildId of label.childrenIds) {
                const oldChild = this.hierarchicalLabelCache.get(oldChildId);
                if (oldChild && oldChild.parentId === labelId) {
                    oldChild.parentId = undefined;
                    oldChild.level = 0;
                    this.setHierarchicalLabelCache(oldChildId, oldChild);
                }
            }

            // Set new children
            label.childrenIds = updates.childrenIds;
            
            // Update new children's parent references
            for (const newChildId of updates.childrenIds) {
                const newChild = this.hierarchicalLabelCache.get(newChildId);
                if (newChild) {
                    newChild.parentId = labelId;
                    newChild.level = label.level + 1;
                    this.setHierarchicalLabelCache(newChildId, newChild);
                }
            }
        }

        // Update cache and persist
        this.setHierarchicalLabelCache(labelId, label);
        await this.persistData();

        return label;
    }

    /**
     * Get hierarchical cache statistics
     */
    getHierarchicalCacheStats(): { size: number; levels: Record<number, number>; filePath: string } {
        const levels: Record<number, number> = {};
        
        for (const label of this.hierarchicalLabelCache.values()) {
            levels[label.level] = (levels[label.level] || 0) + 1;
        }

        return {
            size: this.hierarchicalLabelCache.size,
            levels,
            filePath: this.hierarchicalCacheFilePath
        };
    }

    /**
     * Get or initialize ActiveLearningService instance
     */
    private async getActiveLearningService(): Promise<import('./ActiveLearningService.js').ActiveLearningService> {
        if (!this.activeLearningService) {
            const { ActiveLearningService } = await import('./ActiveLearningService.js');
            this.activeLearningService = new ActiveLearningService();
        }
        return this.activeLearningService;
    }

    /**
     * Record feedback on a generated label
     * @param clusterId - The cluster ID for the label
     * @param feedback - User feedback on the label
     * @param context - Label generation context
     * @param userId - Optional user ID who provided feedback
     * @returns Feedback record ID
     */
    async recordFeedback(
        clusterId: string,
        feedback: {
            rating: number;
            accurate: boolean;
            relevant: boolean;
            suggestedLabel?: string;
            comment?: string;
        },
        context: {
            entities: BaseEntity[];
            label: string;
            labelingMethod: 'llm' | 'heuristic';
            qualityScore?: number;
            domain?: string;
        },
        userId?: string
    ): Promise<string> {
        const activeLearningService = await this.getActiveLearningService();
        
        const labelContext: import('./ActiveLearningService.js').LabelGenerationContext = {
            clusterId,
            entities: context.entities.map(e => ({ id: e.id, name: e.name, type: e.type })),
            label: context.label,
            labelingMethod: context.labelingMethod,
            qualityScore: context.qualityScore,
            entityCount: context.entities.length,
            entityTypes: context.entities.map(e => e.type),
            domain: context.domain || 'policy'
        };

        return await activeLearningService.recordFeedback(clusterId, feedback, labelContext, userId);
    }

    /**
     * Get labels that need review (high uncertainty or low ratings)
     * @param options - Review queue options
     * @returns Array of labels needing review
     */
    async getReviewQueue(options: {
        limit?: number;
        minUncertaintyScore?: number;
        maxRating?: number;
    } = {}): Promise<import('../../models/LabelFeedback.js').LabelFeedbackDocument[]> {
        const activeLearningService = await this.getActiveLearningService();
        return await activeLearningService.getReviewQueue(options);
    }

    /**
     * Get learning insights from collected feedback
     * @returns Learning insights including common issues and improvement suggestions
     */
    async getLearningInsights(): Promise<import('./ActiveLearningService.js').LearningInsights> {
        const activeLearningService = await this.getActiveLearningService();
        return await activeLearningService.getLearningInsights();
    }

    /**
     * Get feedback statistics
     * @returns Feedback statistics
     */
    async getFeedbackStatistics(): Promise<{
        totalFeedback: number;
        averageRating: number;
        accurateCount: number;
        relevantCount: number;
        averageUncertainty?: number;
    }> {
        const activeLearningService = await this.getActiveLearningService();
        return await activeLearningService.getStatistics();
    }
}

// Export singleton instance
export const semanticLabelingService = new SemanticLabelingService();

