import { BaseApiService } from './BaseApiService';
export interface SustainabilityMetrics {
    startDate: string;
    endDate: string;
    apiCallsAvoided: number;
    co2Savings: number;
    energyCostSavings: number;
    cacheHitRate: number;
    cacheHits: number;
    cacheMisses: number;
    totalCacheRequests: number;
    costSavings: number;
    totalAPICalls: number;
    totalTokens: number;
    totalCO2Emitted: number;
    totalCost: number;
}
export interface SustainabilityKPI {
    name: string;
    value: number;
    unit: string;
    target?: number;
    trend?: 'up' | 'down' | 'stable';
    description: string;
}
export declare class SustainabilityApiService extends BaseApiService {
    /**
     * Get sustainability metrics for a time period
     */
    getMetrics(startDate?: Date, endDate?: Date): Promise<SustainabilityMetrics>;
    /**
     * Get sustainability KPIs
     */
    getKPIs(startDate?: Date, endDate?: Date, baselineStartDate?: Date, baselineEndDate?: Date): Promise<SustainabilityKPI[]>;
    /**
     * Download sustainability report
     */
    downloadReport(format: 'json' | 'csv' | 'pdf', startDate?: Date, endDate?: Date, includeBaseline?: boolean, baselineStartDate?: Date, baselineEndDate?: Date): Promise<void>;
}
