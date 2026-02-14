import { BaseApiService } from './BaseApiService';
export interface BronWebsite {
    _id?: string;
    titel: string;
    url: string;
    label: string;
    samenvatting: string;
    'relevantie voor zoekopdracht': string;
    accepted: boolean | null;
    subjects?: string[];
    themes?: string[];
    website_types?: string[];
    queryId?: string;
}
/**
 * BronWebsite API service
 */
export declare class BronWebsiteApiService extends BaseApiService {
    createBronWebsite(data: BronWebsite): Promise<BronWebsite>;
    createBronWebsites(data: BronWebsite[]): Promise<BronWebsite[]>;
    getBronWebsitesByQuery(queryId: string, params?: {
        page?: number;
        limit?: number;
    }): Promise<BronWebsite[]>;
    getAllBronWebsites(params?: {
        page?: number;
        limit?: number;
    }): Promise<BronWebsite[]>;
    updateBronWebsiteAcceptance(id: string, accepted: boolean | null): Promise<BronWebsite>;
}
