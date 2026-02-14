import { getDB } from '../config/database.js';
import { ObjectId, type Filter, type UpdateFilter } from 'mongodb';

export type AICrawlingStrategy = 'site_search' | 'ai_navigation' | 'traditional_crawl' | 'hybrid';
export type AICrawlingDecisionType =
    | 'strategy_selected'
    | 'link_prioritized'
    | 'site_search_detected'
    | 'site_search_performed'
    | 'ai_navigation_analysis'
    | 'document_found'
    | 'decision_explanation';

export interface AICrawlingDecision {
    decisionType: AICrawlingDecisionType;
    timestamp: Date;
    confidence?: number;
    reasoning?: string;
    metadata?: Record<string, unknown>;
}

export interface AICrawlingTraceDocument {
    _id?: ObjectId;
    sessionId: string; // Unique session ID for a crawling operation
    baseUrl: string;
    query: string;
    strategy: AICrawlingStrategy;
    decisions: AICrawlingDecision[];
    documentsFound: Array<{
        documentUrl: string;
        documentTitle?: string;
        foundVia: AICrawlingStrategy;
        decisionIndex: number; // Index in decisions array that led to this document
    }>;
    performanceMetrics: {
        totalDuration?: number; // milliseconds
        llmCalls?: number;
        llmLatency?: number; // milliseconds
        cacheHits?: number;
        cacheMisses?: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

export interface AICrawlingTraceCreateInput {
    sessionId: string;
    baseUrl: string;
    query: string;
    strategy?: AICrawlingStrategy;
    decisions?: AICrawlingDecision[];
    documentsFound?: Array<{
        documentUrl: string;
        documentTitle?: string;
        foundVia: AICrawlingStrategy;
        decisionIndex: number;
    }>;
    performanceMetrics?: {
        totalDuration?: number;
        llmCalls?: number;
        llmLatency?: number;
        cacheHits?: number;
        cacheMisses?: number;
    };
}

const COLLECTION_NAME = 'ai_crawling_traces';

/**
 * AICrawlingTrace model for MongoDB operations
 */
export class AICrawlingTrace {
    /**
     * Create a new AI crawling trace
     */
    static async create(traceInput: AICrawlingTraceCreateInput): Promise<AICrawlingTraceDocument> {
        const db = getDB();
        const now = new Date();

        const traceDoc: AICrawlingTraceDocument = {
            sessionId: traceInput.sessionId,
            baseUrl: traceInput.baseUrl,
            query: traceInput.query,
            strategy: traceInput.strategy || 'traditional_crawl',
            decisions: traceInput.decisions || [],
            documentsFound: traceInput.documentsFound || [],
            performanceMetrics: traceInput.performanceMetrics || {},
            createdAt: now,
            updatedAt: now,
        };

        const result = await db.collection<AICrawlingTraceDocument>(COLLECTION_NAME).insertOne(traceDoc);
        return { ...traceDoc, _id: result.insertedId };
    }

    /**
     * Update an existing trace
     */
    static async update(
        sessionId: string,
        updateData: Partial<AICrawlingTraceCreateInput>
    ): Promise<AICrawlingTraceDocument | null> {
        const db = getDB();
        const updateFields: UpdateFilter<AICrawlingTraceDocument> = {
            $set: {
                updatedAt: new Date(),
            },
        };

        // Handle array updates - merge decisions and documentsFound
        if (updateData.decisions && updateData.decisions.length > 0) {
            updateFields.$push = { decisions: { $each: updateData.decisions } };
        }
        if (updateData.documentsFound && updateData.documentsFound.length > 0) {
            updateFields.$push = { documentsFound: { $each: updateData.documentsFound } };
        }

        // Handle other field updates
        const { decisions: _decisions, documentsFound: _documentsFound, ...otherFields } = updateData;
        if (Object.keys(otherFields).length > 0) {
            if (updateFields.$set) {
                Object.assign(updateFields.$set, otherFields);
            } else {
                updateFields.$set = otherFields;
            }
        }

        const filter: Filter<AICrawlingTraceDocument> = { sessionId };
        const result = await db.collection<AICrawlingTraceDocument>(COLLECTION_NAME).findOneAndUpdate(
            filter,
            updateFields,
            { returnDocument: 'after', upsert: false }
        );

        return result || null;
    }

    /**
     * Find trace by session ID
     */
    static async findBySessionId(sessionId: string): Promise<AICrawlingTraceDocument | null> {
        const db = getDB();
        return await db.collection<AICrawlingTraceDocument>(COLLECTION_NAME).findOne({ sessionId });
    }

    /**
     * Find traces by criteria
     */
    static async find(filters: {
        baseUrl?: string;
        query?: string;
        strategy?: AICrawlingStrategy;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        skip?: number;
        sort?: Record<string, 1 | -1>;
    }): Promise<{ traces: AICrawlingTraceDocument[]; total: number }> {
        const db = getDB();
        const {
            baseUrl,
            query,
            strategy,
            startDate,
            endDate,
            limit = 50,
            skip = 0,
            sort = { createdAt: -1 },
        } = filters;

        const queryFilter: Filter<AICrawlingTraceDocument> = {};

        if (baseUrl) queryFilter.baseUrl = { $regex: baseUrl, $options: 'i' };
        if (query) queryFilter.query = { $regex: query, $options: 'i' };
        if (strategy) queryFilter.strategy = strategy;

        if (startDate || endDate) {
            queryFilter.createdAt = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }

        const [traces, total] = await Promise.all([
            db
                .collection<AICrawlingTraceDocument>(COLLECTION_NAME)
                .find(queryFilter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray(),
            db.collection<AICrawlingTraceDocument>(COLLECTION_NAME).countDocuments(queryFilter),
        ]);

        return { traces, total };
    }

    /**
     * Find traces for a document URL
     */
    static async findByDocumentUrl(documentUrl: string): Promise<AICrawlingTraceDocument[]> {
        const db = getDB();
        
        // Limit to prevent memory exhaustion when loading large trace datasets
        // Default limit: 1000 traces, configurable via environment variable
        const MAX_AI_CRAWLING_TRACES = parseInt(process.env.MAX_AI_CRAWLING_TRACES || '1000', 10);
        
        const traces = await db
            .collection<AICrawlingTraceDocument>(COLLECTION_NAME)
            .find({
                'documentsFound.documentUrl': documentUrl,
            })
            .sort({ createdAt: -1 })
            .limit(MAX_AI_CRAWLING_TRACES)
            .toArray();
        
        // Log warning if query might have been truncated
        if (traces.length === MAX_AI_CRAWLING_TRACES) {
            console.warn(
                `[AICrawlingTrace] findByDocumentUrl() query may have been truncated at ${MAX_AI_CRAWLING_TRACES} entries. ` +
                `Consider increasing MAX_AI_CRAWLING_TRACES.`
            );
        }
        
        return traces;
    }

    /**
     * Get trace statistics
     */
    static async getStatistics(options: {
        startDate?: Date;
        endDate?: Date;
        baseUrl?: string;
    }): Promise<{
        totalTraces: number;
        byStrategy: Record<AICrawlingStrategy, number>;
        averageDuration: number;
        averageDocumentsFound: number;
        totalLLMCalls: number;
        cacheHitRate: number;
    }> {
        const db = getDB();
        const { startDate, endDate, baseUrl } = options;

        const query: Filter<AICrawlingTraceDocument> = {};
        if (baseUrl) query.baseUrl = { $regex: baseUrl, $options: 'i' };
        if (startDate || endDate) {
            query.createdAt = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }

        // Limit to prevent memory exhaustion when calculating statistics
        // Default limit: 10000 traces for stats calculation, configurable via environment variable
        const MAX_AI_CRAWLING_STATS = parseInt(process.env.MAX_AI_CRAWLING_STATS || '10000', 10);

        const traces = await db
            .collection<AICrawlingTraceDocument>(COLLECTION_NAME)
            .find(query)
            .limit(MAX_AI_CRAWLING_STATS)
            .toArray();

        // Log warning if query might have been truncated
        if (traces.length === MAX_AI_CRAWLING_STATS) {
            console.warn(
                `[AICrawlingTrace] getStatistics() query may have been truncated at ${MAX_AI_CRAWLING_STATS} entries. ` +
                `Statistics may be incomplete. Consider using date filters or increasing MAX_AI_CRAWLING_STATS.`
            );
        }

        const stats = {
            totalTraces: traces.length,
            byStrategy: {
                site_search: 0,
                ai_navigation: 0,
                traditional_crawl: 0,
                hybrid: 0,
            } as Record<AICrawlingStrategy, number>,
            averageDuration: 0,
            averageDocumentsFound: 0,
            totalLLMCalls: 0,
            cacheHitRate: 0,
        };

        let totalDuration = 0;
        let totalDocuments = 0;
        let totalCacheHits = 0;
        let totalCacheRequests = 0;

        traces.forEach((trace) => {
            // Count by strategy
            stats.byStrategy[trace.strategy] = (stats.byStrategy[trace.strategy] || 0) + 1;

            // Sum metrics
            if (trace.performanceMetrics.totalDuration) {
                totalDuration += trace.performanceMetrics.totalDuration;
            }
            totalDocuments += trace.documentsFound.length;
            if (trace.performanceMetrics.llmCalls) {
                stats.totalLLMCalls += trace.performanceMetrics.llmCalls;
            }
            if (trace.performanceMetrics.cacheHits) {
                totalCacheHits += trace.performanceMetrics.cacheHits;
            }
            if (trace.performanceMetrics.cacheHits && trace.performanceMetrics.cacheMisses) {
                totalCacheRequests +=
                    trace.performanceMetrics.cacheHits + trace.performanceMetrics.cacheMisses;
            }
        });

        // Calculate averages
        if (traces.length > 0) {
            stats.averageDuration = totalDuration / traces.length;
            stats.averageDocumentsFound = totalDocuments / traces.length;
            stats.cacheHitRate = totalCacheRequests > 0 ? totalCacheHits / totalCacheRequests : 0;
        }

        return stats;
    }

    /**
     * Ensure indexes exist for efficient queries
     */
    static async ensureIndexes(): Promise<void> {
        const db = getDB();
        const collection = db.collection<AICrawlingTraceDocument>(COLLECTION_NAME);

        await collection.createIndex({ sessionId: 1 }, { unique: true });
        await collection.createIndex({ baseUrl: 1 });
        await collection.createIndex({ query: 1 });
        await collection.createIndex({ strategy: 1 });
        await collection.createIndex({ createdAt: -1 });
        await collection.createIndex({ 'documentsFound.documentUrl': 1 });
    }
}

