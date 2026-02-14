import { BaseApiService } from './BaseApiService';
import type { BronDocument } from '../../utils/transformations';
import type { BronWebsite } from './BronWebsiteApiService';
export interface QueryData {
    _id?: string;
    overheidstype?: string;
    overheidsinstantie?: string;
    onderwerp: string;
    websiteTypes: string[];
    websiteUrls?: string[];
    documentUrls?: string[];
    status?: 'draft' | 'completed';
    finalizedAt?: string | Date;
    createdAt?: string | Date;
    updatedAt?: string | Date;
}
/**
 * Query API service
 */
export declare class QueryApiService extends BaseApiService {
    createQuery(data: QueryData): Promise<{
        _id: string;
    } & QueryData>;
    getQueries(params?: {
        page?: number;
        limit?: number;
        skip?: number;
    }): Promise<QueryData[]>;
    getQuery(id: string): Promise<QueryData>;
    updateQuery(id: string, data: Partial<QueryData>): Promise<QueryData>;
    duplicateQuery(id: string, data?: Partial<QueryData>): Promise<QueryData & {
        _id: string;
    }>;
    triggerScan(queryId: string): Promise<{
        success: boolean;
        documentsFound: number;
        sourcesFound: number;
        progress: {
            status: string;
            currentStep: string;
            documentsFound: number;
            sourcesFound: number;
        };
        documents: BronDocument[];
        suggestedSources: BronWebsite[];
    }>;
    getScanStatus(queryId: string): Promise<{
        status: string;
        documentsFound: number;
        sourcesFound: number;
    }>;
    generateWebsiteSuggestions(queryId: string): Promise<{
        success: boolean;
        websites: BronWebsite[];
        metadata?: {
            aiSuggestionsCount: number;
            municipalityWebsiteIncluded: boolean;
            onlyMunicipalityWebsite: boolean;
        };
    }>;
    getQueryProgress(queryId: string): Promise<{
        queryId: string;
        progress: number;
        status: "analyzing" | "searching" | "evaluating" | "generating" | "completed" | "error";
        estimatedSecondsRemaining?: number;
        currentStep?: string;
        totalSteps?: number;
        startedAt: number;
        lastUpdated: number;
        error?: string;
    }>;
    generateMockWebsiteSuggestions(queryId: string): Promise<{
        success: boolean;
        websites: BronWebsite[];
        isMock: boolean;
    }>;
    scrapeSelectedWebsites(queryId: string, websiteIds: string[]): Promise<{
        success: boolean;
        documents: BronDocument[];
        documentsFound: number;
    }>;
    getJurisdictions(): Promise<{
        municipalities: string[];
        waterschappen: string[];
        provincies: string[];
        signature: string;
        timestamp: string;
    }>;
    finalizeQuery(queryId: string): Promise<QueryData & {
        _id: string;
        status: "completed";
        finalizedAt: string;
    }>;
    getCompletedQueries(params?: {
        page?: number;
        limit?: number;
        skip?: number;
    }): Promise<QueryData[]>;
}
