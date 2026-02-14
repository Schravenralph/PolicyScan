import { BaseApiService } from './BaseApiService';
/**
 * Common Crawl API service
 */
export declare class CommonCrawlApiService extends BaseApiService {
    queryCommonCrawl(params: {
        query: string;
        domainFilter?: string;
        crawlId?: string;
        limit?: number;
    }): Promise<{
        results: Array<{
            urlkey: string;
            timestamp: string;
            url: string;
            mime: string;
            status: string;
            digest: string;
            length: string;
            offset: string;
            filename: string;
        }>;
        total: number;
        crawlId: string;
        query: string;
    }>;
    getCommonCrawlCrawls(): Promise<{
        id: string;
        name: string;
        date: string;
    }[]>;
    validateCrawlId(crawlId: string): Promise<{
        isValid: boolean;
        suggestions?: string[];
    }>;
    saveCommonCrawlQuery(params: {
        query: string;
        domainFilter?: string;
        crawlId: string;
        status?: 'pending' | 'approved' | 'rejected';
    }): Promise<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        createdAt: string;
        updatedAt: string;
    }>;
    getCommonCrawlQueries(params?: {
        status?: 'pending' | 'approved' | 'rejected';
        page?: number;
        limit?: number;
        skip?: number;
    }): Promise<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        resultCount: number;
        createdAt: string;
        updatedAt: string;
    }[]>;
    getCommonCrawlQuery(queryId: string): Promise<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        resultCount: number;
        createdAt: string;
        updatedAt: string;
    }>;
    saveCommonCrawlResults(queryId: string, results: Array<{
        urlkey: string;
        timestamp: string;
        url: string;
        mime: string;
        status: string;
        digest: string;
        length: string;
        offset: string;
        filename: string;
    }>): Promise<{
        message: string;
        saved: number;
        skipped: number;
    }>;
    getCommonCrawlResults(queryId: string, params?: {
        approved?: boolean;
        limit?: number;
        skip?: number;
    }): Promise<{
        _id: string;
        queryId: string;
        urlkey: string;
        timestamp: string;
        url: string;
        mime: string;
        status: string;
        digest: string;
        length: string;
        offset: string;
        filename: string;
        approved: boolean;
        createdAt: string;
    }[]>;
    approveCommonCrawlResult(resultId: string): Promise<{
        _id: string;
        approved: boolean;
    }>;
    approveCommonCrawlResults(resultIds: string[]): Promise<{
        message: string;
        approved: number;
    }>;
    deleteCommonCrawlQuery(queryId: string): Promise<{
        message: string;
    }>;
}
