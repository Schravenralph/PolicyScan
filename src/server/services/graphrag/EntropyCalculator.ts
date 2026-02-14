/**
 * Entropy Calculator
 * 
 * Calculates entropy (uncertainty) of LLM responses to measure confidence changes
 * when KG facts are presented. Used in TruthfulRAG conflict detection.
 * 
 * Entropy formula: H = -Σ p(x) * log2(p(x))
 * Higher entropy = lower confidence = more uncertainty
 */

import { LLMService, LLMMessage } from '../llm/LLMService.js';
import { logger } from '../../utils/logger.js';

export interface EntropyResult {
    entropy: number; // H value (0 = certain, higher = uncertain)
    confidence: number; // 1 - normalized entropy (0 = uncertain, 1 = certain)
    tokens: number; // Token usage for calculation
}

export interface EntropyComparison {
    before: EntropyResult;
    after: EntropyResult;
    delta: number; // ΔH_p = H_after - H_before
    isCorrective: boolean; // true if ΔH_p > threshold
}

/**
 * Entropy Calculator Service
 * 
 * Measures LLM confidence via entropy calculation
 */
export class EntropyCalculator {
    private llmService: LLMService;
    private defaultThreshold: number;

    constructor(llmService: LLMService, threshold: number = 0.1) {
        this.llmService = llmService;
        this.defaultThreshold = threshold;
    }

    /**
     * Calculate entropy of LLM response to a query
     * 
     * @param query The query/question
     * @param context Optional context (KG facts or vector content)
     * @returns Entropy result
     */
    async calculateEntropy(query: string, context?: string): Promise<EntropyResult> {
        try {
            // Build prompt to measure confidence
            const prompt = this.buildConfidencePrompt(query, context);

            // Call LLM to get confidence distribution
            const messages: LLMMessage[] = [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that provides confidence assessments. ' +
                        'Respond with a JSON object containing confidence scores for different possible answers.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const response = await this.llmService.generate(messages);
            const tokens = response.usage?.totalTokens || 0;

            // Parse confidence distribution from response
            const confidenceDistribution = this.parseConfidenceDistribution(response.content);

            // Calculate entropy: H = -Σ p(x) * log2(p(x))
            const entropy = this.calculateEntropyFromDistribution(confidenceDistribution);

            // Calculate confidence (inverse of normalized entropy)
            const maxEntropy = Math.log2(confidenceDistribution.length); // Maximum entropy for uniform distribution
            const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
            const confidence = 1 - normalizedEntropy;

            return {
                entropy,
                confidence: Math.max(0, Math.min(1, confidence)), // Clamp to [0, 1]
                tokens
            };
        } catch (error) {
            logger.error({ error }, '[EntropyCalculator] Failed to calculate entropy');
            // Return high entropy (low confidence) on error
            return {
                entropy: 1.0,
                confidence: 0.0,
                tokens: 0
            };
        }
    }

    /**
     * Compare entropy before and after KG facts
     * 
     * @param query The query
     * @param vectorContent Vector-retrieved content (before)
     * @param kgFacts KG facts (after)
     * @param threshold Entropy change threshold (default: 0.1)
     * @returns Entropy comparison result
     */
    async compareEntropy(
        query: string,
        vectorContent: string,
        kgFacts: string,
        threshold?: number
    ): Promise<EntropyComparison> {
        const thresh = threshold ?? this.defaultThreshold;

        // Calculate entropy before KG facts (with vector content)
        const before = await this.calculateEntropy(query, vectorContent);

        // Calculate entropy after KG facts (with vector content + KG facts)
        const after = await this.calculateEntropy(query, `${vectorContent}\n\nKnowledge Graph Facts:\n${kgFacts}`);

        // Calculate delta: ΔH_p = H_after - H_before
        const delta = after.entropy - before.entropy;

        // Path is corrective if entropy increases significantly (KG challenges LLM knowledge)
        const isCorrective = delta > thresh;

        return {
            before,
            after,
            delta,
            isCorrective
        };
    }

    /**
     * Build prompt for confidence assessment
     */
    private buildConfidencePrompt(query: string, context?: string): string {
        let prompt = `Question: ${query}\n\n`;

        if (context) {
            prompt += `Context:\n${context}\n\n`;
        }

        prompt += `Please assess your confidence in answering this question. ` +
            `Provide a JSON object with possible answers and their probability scores (0-1). ` +
            `Example format:\n` +
            `{\n` +
            `  "answers": [\n` +
            `    {"answer": "Answer 1", "probability": 0.7},\n` +
            `    {"answer": "Answer 2", "probability": 0.2},\n` +
            `    {"answer": "Answer 3", "probability": 0.1}\n` +
            `  ]\n` +
            `}\n` +
            `The probabilities should sum to 1.0.`;

        return prompt;
    }

    /**
     * Parse confidence distribution from LLM response
     */
    private parseConfidenceDistribution(response: string): number[] {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as { answers?: Array<{ probability?: number | string }> };
                if (parsed.answers && Array.isArray(parsed.answers)) {
                    return parsed.answers.map((a) => {
                        const prob = typeof a.probability === 'number' ? a.probability : parseFloat(String(a.probability || '0'));
                        return Math.max(0, Math.min(1, prob)); // Clamp to [0, 1]
                    });
                }
            }

            // Fallback: try to extract probabilities from text
            const probMatches = response.match(/probability[:\s]+([0-9.]+)/gi);
            if (probMatches && probMatches.length > 0) {
                const probs = probMatches.map(m => {
                    const num = parseFloat(m.replace(/[^0-9.]/g, ''));
                    return Math.max(0, Math.min(1, num));
                });
                // Normalize to sum to 1
                const sum = probs.reduce((a, b) => a + b, 0);
                return sum > 0 ? probs.map(p => p / sum) : [1.0];
            }

            // Default: uniform distribution (high entropy)
            logger.warn('[EntropyCalculator] Could not parse confidence distribution, using uniform distribution');
            return [0.5, 0.5]; // Two equal probabilities = high entropy
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            logger.warn({ 
                error: errorObj
            }, '[EntropyCalculator] Failed to parse confidence distribution:');
            return [0.5, 0.5]; // Default to high entropy
        }
    }

    /**
     * Calculate entropy from probability distribution
     * H = -Σ p(x) * log2(p(x))
     */
    private calculateEntropyFromDistribution(probabilities: number[]): number {
        if (probabilities.length === 0) {
            return 0;
        }

        // Normalize probabilities to sum to 1
        const sum = probabilities.reduce((a, b) => a + b, 0);
        if (sum === 0) {
            return 0;
        }

        const normalized = probabilities.map(p => p / sum);

        // Calculate entropy
        let entropy = 0;
        for (const prob of normalized) {
            if (prob > 0) {
                entropy -= prob * Math.log2(prob);
            }
        }

        return entropy;
    }

    /**
     * Set entropy threshold
     */
    setThreshold(threshold: number): void {
        this.defaultThreshold = threshold;
    }

    /**
     * Get current threshold
     */
    getThreshold(): number {
        return this.defaultThreshold;
    }
}

