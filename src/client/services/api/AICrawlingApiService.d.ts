import { BaseApiService } from './BaseApiService';
/**
 * AI Crawling API service
 */
export declare class AICrawlingApiService extends BaseApiService {
    getAICrawlingConfig(siteUrl?: string, queryConfig?: Record<string, unknown>): Promise<{
        scope: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
    }>;
    getAICrawlingConfigs(filters?: {
        scope?: 'global' | 'site' | 'query';
        siteUrl?: string;
        enabled?: boolean;
        limit?: number;
        skip?: number;
    }): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }[]>;
    getAICrawlingConfigById(id: string): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }>;
    createAICrawlingConfig(config: {
        scope: 'global' | 'site' | 'query';
        siteUrl?: string;
        aggressiveness: 'low' | 'medium' | 'high';
        strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: 'traditional' | 'skip';
        enabled?: boolean;
    }): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }>;
    updateAICrawlingConfig(id: string, updates: {
        aggressiveness?: 'low' | 'medium' | 'high';
        strategy?: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: 'traditional' | 'skip';
        enabled?: boolean;
    }): Promise<{
        _id?: string;
        scope: "global" | "site" | "query";
        siteUrl?: string;
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }>;
    deleteAICrawlingConfig(id: string): Promise<void>;
    getGlobalAICrawlingConfig(): Promise<{
        scope: "global";
        aggressiveness: "low" | "medium" | "high";
        strategy: "site_search" | "ai_navigation" | "traditional" | "auto";
        maxDepth?: number;
        maxLinks?: number;
        llmModel?: string;
        cacheEnabled?: boolean;
        cacheTTL?: number;
        timeout?: number;
        fallbackBehavior?: "traditional" | "skip";
        enabled: boolean;
    }>;
    /**
     * Get explanation for why a document was found via AI-guided crawling
     */
    getDocumentExplanation(documentUrl: string): Promise<{
        explanation: string;
        detailedExplanation: string;
        strategy: string;
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
    } | null>;
    /**
     * Get AI crawling trace by session ID (admin/developer only)
     */
    getAICrawlingTrace(sessionId: string): Promise<{
        trace: {
            _id?: string;
            sessionId: string;
            baseUrl: string;
            query: string;
            strategy: 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';
            decisions: Array<{
                decisionType: string;
                timestamp: Date;
                confidence?: number;
                reasoning?: string;
                metadata?: Record<string, unknown>;
            }>;
            documentsFound: Array<{
                documentUrl: string;
                documentTitle?: string;
                foundVia: string;
                decisionIndex: number;
            }>;
            performanceMetrics: {
                totalDuration?: number;
                llmCalls?: number;
                llmLatency?: number;
                cacheHits?: number;
                cacheMisses?: number;
            };
            createdAt: Date;
            updatedAt: Date;
        };
        explanation: string;
        summary?: {
            strategy: string;
            documentsFound: number;
            decisionsMade: number;
            duration?: number;
            llmCalls?: number;
        };
    }>;
    /**
     * List AI crawling traces (admin/developer only)
     */
    listAICrawlingTraces(filters?: {
        baseUrl?: string;
        query?: string;
        strategy?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        skip?: number;
    }): Promise<{
        traces: Array<{
            _id?: string;
            sessionId: string;
            baseUrl: string;
            query: string;
            strategy: 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';
            decisions: Array<{
                decisionType: string;
                timestamp: Date;
                confidence?: number;
                reasoning?: string;
                metadata?: Record<string, unknown>;
            }>;
            documentsFound: Array<{
                documentUrl: string;
                documentTitle?: string;
                foundVia: string;
                decisionIndex: number;
            }>;
            performanceMetrics: {
                totalDuration?: number;
                llmCalls?: number;
                llmLatency?: number;
                cacheHits?: number;
                cacheMisses?: number;
            };
            createdAt: Date;
            updatedAt: Date;
        }>;
        total: number;
        limit: number;
        skip: number;
    }>;
    /**
     * Export AI crawling traces as a file
     */
    exportAICrawlingTraces(filters?: {
        baseUrl?: string;
        query?: string;
        strategy?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<Blob>;
}
