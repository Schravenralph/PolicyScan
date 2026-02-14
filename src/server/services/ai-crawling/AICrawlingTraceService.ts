import {
    AICrawlingTrace,
    AICrawlingTraceCreateInput,
    AICrawlingDecision,
    AICrawlingDecisionType,
    AICrawlingStrategy,
} from '../../models/AICrawlingTrace.js';
import { randomUUID } from 'crypto';

/**
 * Service for managing AI crawling trace logging
 */
export class AICrawlingTraceService {
    // private static activeTraces: Map<string, string> = new Map(); // sessionId -> trace sessionId mapping - Unused

    /**
     * Start a new trace session
     */
    static async startTrace(
        baseUrl: string,
        query: string,
        strategy?: AICrawlingStrategy
    ): Promise<string> {
        const sessionId = randomUUID();

        const traceInput: AICrawlingTraceCreateInput = {
            sessionId,
            baseUrl,
            query,
            strategy: strategy || 'traditional_crawl',
            decisions: [],
            documentsFound: [],
            performanceMetrics: {},
        };

        try {
            await AICrawlingTrace.create(traceInput);
            return sessionId;
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to create trace:', error);
            // Return session ID anyway so logging can continue
            return sessionId;
        }
    }

    /**
     * Log an AI decision
     */
    static async logDecision(
        sessionId: string,
        decisionType: AICrawlingDecisionType,
        options: {
            confidence?: number;
            reasoning?: string;
            metadata?: Record<string, unknown>;
        } = {}
    ): Promise<void> {
        const decision: AICrawlingDecision = {
            decisionType,
            timestamp: new Date(),
            confidence: options.confidence,
            reasoning: options.reasoning,
            metadata: options.metadata || {},
        };

        try {
            await AICrawlingTrace.update(sessionId, {
                decisions: [decision],
            });
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to log decision:', error);
            // Don't throw - trace logging should not break crawling
        }
    }

    /**
     * Log a document found via AI crawling
     */
    static async logDocumentFound(
        sessionId: string,
        documentUrl: string,
        documentTitle: string | undefined,
        foundVia: AICrawlingStrategy,
        decisionIndex: number
    ): Promise<void> {
        try {
            await AICrawlingTrace.update(sessionId, {
                documentsFound: [
                    {
                        documentUrl,
                        documentTitle,
                        foundVia,
                        decisionIndex,
                    },
                ],
            });
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to log document found:', error);
            // Don't throw - trace logging should not break crawling
        }
    }

    /**
     * Update performance metrics
     */
    static async updatePerformanceMetrics(
        sessionId: string,
        metrics: {
            totalDuration?: number;
            llmCalls?: number;
            llmLatency?: number;
            cacheHits?: number;
            cacheMisses?: number;
        }
    ): Promise<void> {
        try {
            // Get existing trace to merge metrics
            const existingTrace = await AICrawlingTrace.findBySessionId(sessionId);
            if (!existingTrace) {
                return;
            }

            const mergedMetrics = {
                ...existingTrace.performanceMetrics,
                ...metrics,
                // Merge counts
                llmCalls:
                    (existingTrace.performanceMetrics.llmCalls || 0) +
                    (metrics.llmCalls || 0),
                cacheHits:
                    (existingTrace.performanceMetrics.cacheHits || 0) + (metrics.cacheHits || 0),
                cacheMisses:
                    (existingTrace.performanceMetrics.cacheMisses || 0) + (metrics.cacheMisses || 0),
            };

            await AICrawlingTrace.update(sessionId, {
                performanceMetrics: mergedMetrics,
            });
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to update performance metrics:', error);
            // Don't throw - trace logging should not break crawling
        }
    }

    /**
     * Update strategy
     */
    static async updateStrategy(
        sessionId: string,
        strategy: AICrawlingStrategy
    ): Promise<void> {
        try {
            await AICrawlingTrace.update(sessionId, {
                strategy,
            });
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to update strategy:', error);
            // Don't throw - trace logging should not break crawling
        }
    }

    /**
     * Get trace by session ID
     */
    static async getTrace(sessionId: string) {
        try {
            return await AICrawlingTrace.findBySessionId(sessionId);
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to get trace:', error);
            return null;
        }
    }

    /**
     * Get traces for a document URL
     */
    static async getTracesForDocument(documentUrl: string) {
        try {
            return await AICrawlingTrace.findByDocumentUrl(documentUrl);
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to get traces for document:', error);
            return [];
        }
    }

    /**
     * Get explanation for why a document was found
     */
    static async getDocumentExplanation(
        documentUrl: string
    ): Promise<{
        explanation: string;
        detailedExplanation: string;
        strategy: AICrawlingStrategy;
        confidence?: number;
        reasoning?: string;
        traceId?: string;
        baseUrl?: string;
        query?: string;
        crawlDate?: Date;
        decisionPath?: Array<{
            step: number;
            decisionType: string;
            reasoning?: string;
            timestamp?: Date;
        }>;
    } | null> {
        try {
            const traces = await AICrawlingTrace.findByDocumentUrl(documentUrl);
            if (traces.length === 0) {
                return null;
            }

            // Get the most recent trace
            const trace = traces[0];
            const documentInfo = trace.documentsFound.find((doc: { documentUrl: string }) => doc.documentUrl === documentUrl);
            if (!documentInfo) {
                return null;
            }

            // Get the decision that led to this document
            const decision = trace.decisions[documentInfo.decisionIndex || 0];
            
            // Build decision path (all decisions leading up to finding this document)
            const decisionPath: Array<{
                step: number;
                decisionType: string;
                reasoning?: string;
                timestamp?: Date;
            }> = [];
            
            // Include all decisions up to and including the one that found the document
            const relevantDecisions = trace.decisions.slice(0, (documentInfo.decisionIndex || 0) + 1);
            relevantDecisions.forEach((dec: { decisionType: AICrawlingDecisionType; reasoning?: string; timestamp?: Date }, idx: number) => {
                decisionPath.push({
                    step: idx + 1,
                    decisionType: this.formatDecisionType(dec.decisionType),
                    reasoning: dec.reasoning,
                    timestamp: dec.timestamp,
                });
            });

            // Create detailed explanation
            const detailedParts: string[] = [];
            detailedParts.push(`📄 Document: ${documentInfo.documentTitle || documentUrl}`);
            detailedParts.push(`🔍 Found via: ${this.formatStrategy(documentInfo.foundVia)}`);
            
            if (trace.query) {
                detailedParts.push(`\n💡 Search Query: "${trace.query}"`);
            }
            if (trace.baseUrl) {
                detailedParts.push(`🌐 Website: ${trace.baseUrl}`);
            }
            
            detailedParts.push('\n📊 How This Document Was Discovered:');
            decisionPath.forEach((step, idx) => {
                detailedParts.push(`\n${idx + 1}. ${step.decisionType}`);
                if (step.reasoning) {
                    detailedParts.push(`   → ${step.reasoning}`);
                }
                if (step.timestamp) {
                    detailedParts.push(`   ⏰ ${new Date(step.timestamp).toLocaleTimeString('nl-NL')}`);
                }
            });
            
            if (decision?.confidence !== undefined) {
                const confidencePct = (decision.confidence * 100).toFixed(0);
                detailedParts.push(`\n🎯 Confidence Score: ${confidencePct}%`);
                if (decision.confidence >= 0.8) {
                    detailedParts.push('   → High confidence - very likely to be relevant');
                } else if (decision.confidence >= 0.5) {
                    detailedParts.push('   → Medium confidence - likely to be relevant');
                } else {
                    detailedParts.push('   → Lower confidence - may require review');
                }
            }
            
            // Add context about the strategy
            if (documentInfo.foundVia === 'site_search') {
                detailedParts.push('\n🔎 Site Search Strategy:');
                detailedParts.push('   → The website\'s built-in search feature was used');
                detailedParts.push('   → This is typically the fastest and most direct method');
            } else if (documentInfo.foundVia === 'ai_navigation') {
                detailedParts.push('\n🤖 AI Navigation Strategy:');
                detailedParts.push('   → An AI model analyzed the website structure');
                detailedParts.push('   → Links were prioritized based on relevance to your query');
                if (decision?.metadata?.topLinkScore && typeof decision.metadata.topLinkScore === 'number') {
                    const score = (decision.metadata.topLinkScore * 100).toFixed(0);
                    detailedParts.push(`   → This document had a relevance score of ${score}%`);
                }
            } else if (documentInfo.foundVia === 'traditional_crawl') {
                detailedParts.push('\n🔗 Traditional Crawl Strategy:');
                detailedParts.push('   → Links were matched using keyword analysis');
                detailedParts.push('   → This fallback method ensures no relevant content is missed');
            }

            return {
                explanation:
                    decision?.reasoning ||
                    `This document was discovered using the ${this.formatStrategy(documentInfo.foundVia).toLowerCase()} strategy.`,
                detailedExplanation: detailedParts.join('\n'),
                strategy: documentInfo.foundVia,
                confidence: decision?.confidence,
                reasoning: decision?.reasoning,
                traceId: trace._id?.toString(),
                baseUrl: trace.baseUrl,
                query: trace.query,
                crawlDate: trace.createdAt,
                decisionPath,
            };
        } catch (error) {
            console.error('[AICrawlingTraceService] Failed to get document explanation:', error);
            return null;
        }
    }

    /**
     * Generate human-readable explanation from trace
     */
    static generateExplanation(trace: {
        sessionId?: string;
        baseUrl?: string;
        query?: string;
        strategy: AICrawlingStrategy;
        decisions: AICrawlingDecision[];
        documentsFound: Array<{
            documentUrl: string;
            documentTitle?: string;
            foundVia: AICrawlingStrategy;
            decisionIndex?: number;
        }>;
        performanceMetrics?: {
            totalDuration?: number;
            llmCalls?: number;
            cacheHits?: number;
            cacheMisses?: number;
        };
        createdAt?: Date;
    }): string {
        const parts: string[] = [];

        // Header with context
        parts.push('═'.repeat(60));
        parts.push('AI-GUIDED CRAWLING EXPLANATION');
        parts.push('═'.repeat(60));
        
        if (trace.baseUrl) {
            parts.push(`\n📍 Target Website: ${trace.baseUrl}`);
        }
        if (trace.query) {
            parts.push(`🔍 Search Query: "${trace.query}"`);
        }
        if (trace.createdAt) {
            const date = new Date(trace.createdAt);
            parts.push(`⏰ Crawl Started: ${date.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}`);
        }

        // Overall strategy
        parts.push(`\n📊 Overall Strategy: ${this.formatStrategy(trace.strategy)}`);
        
        if (trace.strategy === 'hybrid') {
            parts.push('   → Multiple strategies were used to maximize document discovery');
        } else {
            parts.push(`   → Documents were found using the ${this.formatStrategy(trace.strategy).toLowerCase()} approach`);
        }

        // Performance summary
        if (trace.performanceMetrics) {
            const metrics = trace.performanceMetrics;
            parts.push('\n⚡ Performance Summary:');
            if (metrics.totalDuration) {
                const seconds = (metrics.totalDuration / 1000).toFixed(1);
                parts.push(`   • Total Duration: ${seconds}s`);
            }
            if (metrics.llmCalls !== undefined) {
                parts.push(`   • LLM API Calls: ${metrics.llmCalls}`);
            }
            if (metrics.cacheHits !== undefined || metrics.cacheMisses !== undefined) {
                const hits = metrics.cacheHits || 0;
                const misses = metrics.cacheMisses || 0;
                const total = hits + misses;
                if (total > 0) {
                    const hitRate = ((hits / total) * 100).toFixed(0);
                    parts.push(`   • Cache Performance: ${hits} hits, ${misses} misses (${hitRate}% hit rate)`);
                }
            }
        }

        // Decision timeline with detailed reasoning
        if (trace.decisions.length > 0) {
            parts.push('\n📋 Decision Timeline:');
            parts.push('─'.repeat(60));
            
            trace.decisions.forEach((decision, index) => {
                const timeStr = decision.timestamp 
                    ? new Date(decision.timestamp).toLocaleTimeString('nl-NL', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                    })
                    : `Step ${index + 1}`;
                
                parts.push(`\n${index + 1}. [${timeStr}] ${this.formatDecisionType(decision.decisionType)}`);
                
                if (decision.reasoning) {
                    // Format reasoning with better readability
                    const reasoningLines = decision.reasoning.split('\n');
                    reasoningLines.forEach((line: string) => {
                        parts.push(`   └─ ${line.trim()}`);
                    });
                }
                
                if (decision.confidence !== undefined) {
                    const confidenceBar = '█'.repeat(Math.floor(decision.confidence * 10));
                    parts.push(`   └─ Confidence: ${(decision.confidence * 100).toFixed(0)}% ${confidenceBar}`);
                }
                
                // Show relevant metadata
                if (decision.metadata && Object.keys(decision.metadata).length > 0) {
                    const metadataStr = Object.entries(decision.metadata)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                    parts.push(`   └─ Details: ${metadataStr}`);
                }
            });
        }

        // Documents found with strategy mapping
        if (trace.documentsFound.length > 0) {
            parts.push('\n📄 Documents Discovered:');
            parts.push('─'.repeat(60));
            parts.push(`Total: ${trace.documentsFound.length} document${trace.documentsFound.length !== 1 ? 's' : ''}`);
            
            // Group by strategy
            const byStrategy = trace.documentsFound.reduce((acc, doc) => {
                if (!acc[doc.foundVia]) acc[doc.foundVia] = [];
                acc[doc.foundVia].push(doc);
                return acc;
            }, {} as Record<AICrawlingStrategy, typeof trace.documentsFound>);
            
            Object.entries(byStrategy).forEach(([strategy, docs]) => {
                parts.push(`\n   Via ${this.formatStrategy(strategy as AICrawlingStrategy)} (${docs.length}):`);
                docs.slice(0, 10).forEach((doc, idx) => {
                    const title = doc.documentTitle || new URL(doc.documentUrl).pathname.split('/').pop() || doc.documentUrl;
                    parts.push(`   ${idx + 1}. ${title}`);
                    
                    // Link to decision if available
                    if (doc.decisionIndex !== undefined && trace.decisions[doc.decisionIndex]) {
                        const decision = trace.decisions[doc.decisionIndex];
                        if (decision.reasoning) {
                            const shortReason = decision.reasoning.substring(0, 60);
                            parts.push(`      → ${shortReason}${decision.reasoning.length > 60 ? '...' : ''}`);
                        }
                    }
                });
                if (docs.length > 10) {
                    parts.push(`   ... and ${docs.length - 10} more via ${this.formatStrategy(strategy as AICrawlingStrategy).toLowerCase()}`);
                }
            });
        } else {
            parts.push('\n📄 Documents Discovered: None');
            parts.push('   → No documents were found during this crawl session');
        }

        // Strategy analysis
        parts.push('\n🔍 Strategy Analysis:');
        parts.push('─'.repeat(60));
        
        const strategiesAttempted = new Set<string>();
        trace.decisions.forEach(decision => {
            if (decision.decisionType === 'site_search_detected') {
                strategiesAttempted.add('site_search');
            } else if (decision.decisionType === 'ai_navigation_analysis') {
                strategiesAttempted.add('ai_navigation');
            } else if (decision.decisionType === 'link_prioritized' && decision.metadata?.totalLinks) {
                strategiesAttempted.add('traditional_crawl');
            }
        });
        
        const strategiesUsed = new Set(trace.documentsFound.map(d => d.foundVia));
        
        if (strategiesAttempted.has('site_search')) {
            const wasSuccessful = strategiesUsed.has('site_search');
            parts.push(`✓ Site Search: ${wasSuccessful ? 'SUCCESS' : 'ATTEMPTED (no results)'}`);
            if (wasSuccessful) {
                const count = trace.documentsFound.filter(d => d.foundVia === 'site_search').length;
                parts.push(`  → Found ${count} document${count !== 1 ? 's' : ''} using the website's built-in search`);
            }
        }
        
        if (strategiesAttempted.has('ai_navigation')) {
            const wasSuccessful = strategiesUsed.has('ai_navigation');
            parts.push(`✓ AI Navigation: ${wasSuccessful ? 'SUCCESS' : 'ATTEMPTED (no results)'}`);
            if (wasSuccessful) {
                const count = trace.documentsFound.filter(d => d.foundVia === 'ai_navigation').length;
                parts.push(`  → Found ${count} document${count !== 1 ? 's' : ''} using LLM-guided link prioritization`);
            }
        }
        
        if (strategiesAttempted.has('traditional_crawl')) {
            const wasSuccessful = strategiesUsed.has('traditional_crawl');
            parts.push(`✓ Traditional Crawl: ${wasSuccessful ? 'SUCCESS' : 'ATTEMPTED (no results)'}`);
            if (wasSuccessful) {
                const count = trace.documentsFound.filter(d => d.foundVia === 'traditional_crawl').length;
                parts.push(`  → Found ${count} document${count !== 1 ? 's' : ''} using keyword-based link matching`);
            }
        }

        parts.push('\n' + '═'.repeat(60));
        
        return parts.join('\n');
    }

    /**
     * Format strategy name for display
     */
    private static formatStrategy(strategy: AICrawlingStrategy): string {
        switch (strategy) {
            case 'site_search':
                return 'Site Search';
            case 'ai_navigation':
                return 'AI Navigation';
            case 'traditional_crawl':
                return 'Traditional Crawl';
            case 'hybrid':
                return 'Hybrid';
            default:
                return strategy;
        }
    }

    /**
     * Format decision type for display
     */
    private static formatDecisionType(decisionType: AICrawlingDecisionType): string {
        switch (decisionType) {
            case 'strategy_selected':
                return 'Strategy Selected';
            case 'link_prioritized':
                return 'Link Prioritized';
            case 'site_search_detected':
                return 'Site Search Detected';
            case 'site_search_performed':
                return 'Site Search Performed';
            case 'ai_navigation_analysis':
                return 'AI Navigation Analysis';
            case 'document_found':
                return 'Document Found';
            case 'decision_explanation':
                return 'Decision Explanation';
            default:
                return decisionType;
        }
    }
}

