/**
 * LLM Answer Generation Service
 * 
 * Generates natural language answers from KG facts and vector context.
 * This completes the GraphRAG pipeline by providing human-readable answers with citations.
 */

import { LLMService, LLMMessage, LLMResponse } from '../llm/LLMService.js';
import { FactResult } from './FactFirstRetrievalService.js';
import { HybridScoreResult } from './HybridScorer.js';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { logger } from '../../utils/logger.js';
import { CitationFormatter, CitationFormat } from './CitationFormatter.js';
import { getAnswerGenerationPrompts, AnswerType } from './prompts/answerGenerationPrompts.js';

/**
 * Answer generation options
 */
export interface AnswerGenerationOptions {
    answerType?: AnswerType;
    citationFormat?: CitationFormat;
    maxLength?: number;
    includeScoreBreakdown?: boolean;
    temperature?: number;
}

/**
 * Generated answer with citations
 */
export interface GeneratedAnswer {
    answer: string;
    citations: Array<{
        type: 'entity' | 'document';
        id: string;
        name?: string;
        url?: string;
        timestamp?: string;
    }>;
    answerType: AnswerType;
    confidence?: number;
    metadata?: {
        queryTime: number;
        factsUsed: number;
        vectorChunksUsed?: number;
        llmModel: string;
        llmUsage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    };
}

/**
 * Input for answer generation
 */
export interface AnswerGenerationInput {
    query: string;
    facts: FactResult[];
    vectorChunks?: Array<{
        id: string;
        content: string;
        similarity: number;
        metadata?: Record<string, unknown>;
    }>;
    hybridScores?: HybridScoreResult[];
    options?: AnswerGenerationOptions;
}

/**
 * LLM Answer Generator Service
 * 
 * Generates natural language answers from KG facts and vector context
 */
export class LLMAnswerGenerator {
    private llmService: LLMService;
    private citationFormatter: CitationFormatter;

    constructor(llmService?: LLMService) {
        this.llmService = llmService || new LLMService({
            provider: 'openai',
            model: process.env.ANSWER_GENERATION_MODEL || 'gpt-4o-mini',
            temperature: 0.3,
            maxTokens: parseInt(process.env.ANSWER_GENERATION_MAX_TOKENS || '1000', 10),
            enabled: process.env.RAG_ENABLED === 'true',
        });
        this.citationFormatter = new CitationFormatter();
    }

    /**
     * Generate answer from KG facts and vector context
     */
    async generateAnswer(input: AnswerGenerationInput): Promise<GeneratedAnswer> {
        const startTime = Date.now();

        // Check if answer generation is enabled
        if (!FeatureFlag.isEnabled(KGFeatureFlag.KG_LLM_ANSWER_GENERATION_ENABLED, false)) {
            logger.debug('[LLMAnswerGenerator] Feature flag disabled');
            throw new Error('LLM answer generation is disabled. Enable KG_LLM_ANSWER_GENERATION_ENABLED feature flag.');
        }

        if (!this.llmService.isEnabled()) {
            throw new Error('LLM service is disabled. Set RAG_ENABLED=true to enable.');
        }

        // Determine answer type if not specified
        const answerType = input.options?.answerType || this.determineAnswerType(input.query, input.facts);

        // Get prompts for answer type
        const prompts = getAnswerGenerationPrompts(answerType);

        // Format facts and context for LLM
        const formattedFacts = this.formatFactsForLLM(input.facts);
        const formattedVectorContext = input.vectorChunks 
            ? this.formatVectorContextForLLM(input.vectorChunks)
            : '';

        // Build messages
        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: prompts.systemPrompt,
            },
            {
                role: 'user',
                content: this.buildUserPrompt(
                    input.query,
                    formattedFacts,
                    formattedVectorContext,
                    prompts.userPromptTemplate,
                    input.options
                ),
            },
        ];

        // Generate answer
        let llmResponse: LLMResponse;
        try {
            llmResponse = await this.llmService.generate(messages);
        } catch (error) {
            logger.error({ error }, '[LLMAnswerGenerator] Error generating answer');
            throw new Error(`Failed to generate answer: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Extract citations from answer
        const citations = this.extractCitations(llmResponse.content, input.facts, input.vectorChunks);

        // Format citations
        const citationFormat = input.options?.citationFormat || 'markdown';
        const formattedAnswer = this.citationFormatter.formatAnswer(
            llmResponse.content,
            citations,
            citationFormat
        );

        // Calculate confidence (average of fact relevance scores if available)
        const confidence = this.calculateConfidence(input.facts, input.hybridScores);

        const queryTime = Date.now() - startTime;

        return {
            answer: formattedAnswer,
            citations,
            answerType,
            confidence,
            metadata: {
                queryTime,
                factsUsed: input.facts.length,
                vectorChunksUsed: input.vectorChunks?.length,
                llmModel: llmResponse.model,
                llmUsage: llmResponse.usage,
            },
        };
    }

    /**
     * Generate summary of graph subgraph
     */
    async generateSubgraphSummary(
        facts: FactResult[],
        options?: { maxLength?: number }
    ): Promise<GeneratedAnswer> {
        const prompts = getAnswerGenerationPrompts('summary');
        
        const formattedFacts = this.formatFactsForLLM(facts);
        
        const messages: LLMMessage[] = [
            {
                role: 'system',
                content: prompts.systemPrompt,
            },
            {
                role: 'user',
                content: `Summarize the following knowledge graph facts:\n\n${formattedFacts}\n\nProvide a concise summary (max ${options?.maxLength || 300} words).`,
            },
        ];

        const llmResponse = await this.llmService.generate(messages);
        const citations = this.extractCitations(llmResponse.content, facts);

        return {
            answer: this.citationFormatter.formatAnswer(llmResponse.content, citations, 'markdown'),
            citations,
            answerType: 'summary',
            metadata: {
                queryTime: 0,
                factsUsed: facts.length,
                llmModel: llmResponse.model,
                llmUsage: llmResponse.usage,
            },
        };
    }

    /**
     * Determine answer type from query and facts
     */
    private determineAnswerType(query: string, _facts: FactResult[]): AnswerType {
        const lowerQuery = query.toLowerCase();

        // Comparative queries
        if (lowerQuery.includes('compare') || lowerQuery.includes('versus') || lowerQuery.includes('difference')) {
            return 'comparative';
        }

        // Explanatory queries
        if (lowerQuery.includes('why') || lowerQuery.includes('how') || lowerQuery.includes('explain')) {
            return 'explanatory';
        }

        // Summary queries
        if (lowerQuery.includes('summarize') || lowerQuery.includes('overview') || lowerQuery.includes('summary')) {
            return 'summary';
        }

        // Default to direct factual answer
        return 'direct';
    }

    /**
     * Format facts for LLM consumption
     */
    private formatFactsForLLM(facts: FactResult[]): string {
        if (facts.length === 0) {
            return 'No facts available.';
        }

        return facts.map((fact, index) => {
            const entity = fact.entity;
            const entityInfo = [
                `Fact ${index + 1}:`,
                `  Entity: ${entity.name || entity.id}`,
                `  Type: ${entity.type}`,
            ];

            if (entity.description) {
                entityInfo.push(`  Description: ${entity.description}`);
            }

            // Add entity properties
            if (entity.metadata && Object.keys(entity.metadata).length > 0) {
                const props = Object.entries(entity.metadata)
                    .map(([key, value]) => `    ${key}: ${value}`)
                    .join('\n');
                entityInfo.push(`  Properties:\n${props}`);
            }

            // Add relationships
            if (fact.relationships && fact.relationships.length > 0) {
                const rels = fact.relationships
                    .map(rel => `    - ${rel.type}: ${rel.targetId}`)
                    .join('\n');
                entityInfo.push(`  Relationships:\n${rels}`);
            }

            // Add provenance
            if (fact.provenance) {
                if (fact.provenance.sourceUrls && fact.provenance.sourceUrls.length > 0) {
                    entityInfo.push(`  Sources: ${fact.provenance.sourceUrls.join(', ')}`);
                }
                if (fact.provenance.extractionTimestamp) {
                    entityInfo.push(`  Extracted: ${fact.provenance.extractionTimestamp}`);
                }
            }

            // Add relevance score if available
            if (fact.relevanceScore !== undefined) {
                entityInfo.push(`  Relevance: ${(fact.relevanceScore * 100).toFixed(1)}%`);
            }

            return entityInfo.join('\n');
        }).join('\n\n');
    }

    /**
     * Format vector context for LLM consumption
     */
    private formatVectorContextForLLM(vectorChunks: Array<{
        id: string;
        content: string;
        similarity: number;
        metadata?: Record<string, unknown>;
    }>): string {
        if (vectorChunks.length === 0) {
            return '';
        }

        return vectorChunks
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5) // Top 5 chunks
            .map((chunk, index) => {
                const lines = [
                    `Context ${index + 1} (similarity: ${(chunk.similarity * 100).toFixed(1)}%):`,
                    chunk.content.substring(0, 500), // Limit length
                ];

                if (chunk.metadata?.sourceUrl) {
                    lines.push(`Source: ${chunk.metadata.sourceUrl}`);
                }

                return lines.join('\n');
            })
            .join('\n\n');
    }

    /**
     * Build user prompt from template
     */
    private buildUserPrompt(
        query: string,
        formattedFacts: string,
        formattedVectorContext: string,
        template: string,
        options?: AnswerGenerationOptions
    ): string {
        let prompt = template
            .replace('{query}', query)
            .replace('{facts}', formattedFacts);

        if (formattedVectorContext) {
            prompt = prompt.replace('{vectorContext}', `\n\nAdditional Context:\n${formattedVectorContext}`);
        } else {
            prompt = prompt.replace('{vectorContext}', '');
        }

        if (options?.maxLength) {
            prompt += `\n\nPlease keep the answer under ${options.maxLength} words.`;
        }

        return prompt;
    }

    /**
     * Extract citations from answer text
     */
    private extractCitations(
        _answer: string,
        facts: FactResult[],
        vectorChunks?: Array<{ id: string; metadata?: Record<string, unknown> }>
    ): Array<{
        type: 'entity' | 'document';
        id: string;
        name?: string;
        url?: string;
        timestamp?: string;
    }> {
        const citations: Array<{
            type: 'entity' | 'document';
            id: string;
            name?: string;
            url?: string;
            timestamp?: string;
        }> = [];

        // Extract entity citations from facts
        for (const fact of facts) {
            const entity = fact.entity;
            if (fact.provenance?.sourceUrls && fact.provenance.sourceUrls.length > 0) {
                citations.push({
                    type: 'entity',
                    id: entity.id,
                    name: entity.name,
                    url: fact.provenance.sourceUrls[0],
                    timestamp: fact.provenance.extractionTimestamp,
                });
            } else {
                citations.push({
                    type: 'entity',
                    id: entity.id,
                    name: entity.name,
                });
            }
        }

        // Extract document citations from vector chunks
        if (vectorChunks) {
            for (const chunk of vectorChunks) {
                if (chunk.metadata?.sourceUrl && !citations.find(c => c.url === chunk.metadata?.sourceUrl)) {
                    citations.push({
                        type: 'document',
                        id: chunk.id,
                        url: chunk.metadata.sourceUrl as string,
                    });
                }
            }
        }

        return citations;
    }

    /**
     * Calculate confidence score from facts and hybrid scores
     */
    private calculateConfidence(
        facts: FactResult[],
        hybridScores?: HybridScoreResult[]
    ): number | undefined {
        if (facts.length === 0) {
            return undefined;
        }

        // Use hybrid scores if available
        if (hybridScores && hybridScores.length > 0) {
            const avgScore = hybridScores.reduce((sum, score) => sum + score.finalScore, 0) / hybridScores.length;
            return avgScore;
        }

        // Fall back to relevance scores
        const relevanceScores = facts
            .map(fact => fact.relevanceScore)
            .filter((score): score is number => score !== undefined);

        if (relevanceScores.length === 0) {
            return undefined;
        }

        return relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;
    }

    /**
     * Check if answer generation is enabled
     */
    isEnabled(): boolean {
        return FeatureFlag.isEnabled(KGFeatureFlag.KG_LLM_ANSWER_GENERATION_ENABLED, false) 
            && this.llmService.isEnabled();
    }
}

