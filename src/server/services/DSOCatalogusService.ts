/**
 * Service for querying the DSO Stelselcatalogus API
 * 
 * The Stelselcatalogus provides vocabulary and concepts for the Omgevingswet (Environment Act),
 * focusing on urban planning, spatial regulations, and environmental policy.
 * 
 * API Documentation: https://developer.omgevingswet.overheid.nl/api-register/api/catalogus-opvragen/
 */

import { AxiosInstance } from 'axios';
import axios from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../config/httpClient.js';
import { getDeploymentConfig } from '../config/deployment.js';

export interface DSOConcept {
    id: string;
    label: string;
    definitie?: string; // Formal definition
    uitleg?: string; // Plain language explanation
    bron?: string; // Source
    publicatiedatum?: string;
    vervaldatum?: string;
    geldigheidsdatum?: string;
    vervaldatumGeldigheid?: string;
    gerelateerdeBegrippen?: DSORelation[];
    generalisatie?: string[]; // Broader terms
    specialisatie?: string[]; // Narrower terms
    onderdeelVan?: string[]; // Part-of relationships
    bestaatUit?: string[]; // Consists-of relationships
    domein?: string;
    collectie?: string;
    bronhouder?: string;
}

export interface DSORelation {
    type: 'semantisch' | 'generalisatie' | 'specialisatie' | 'onderdeel' | 'bestaatUit';
    gerelateerdBegrip: string;
    label?: string;
}

export interface DSOCatalogusResponse {
    items: DSOConcept[];
    total?: number;
    page?: number;
    pageSize?: number;
}

export interface DSOCatalogusOptions {
    domein?: string;
    collectie?: string;
    query?: string;
    page?: number;
    pageSize?: 10 | 20 | 40 | 100; // API only accepts these values
}

/**
 * Service for interacting with DSO Stelselcatalogus API
 */
export class DSOCatalogusService {
    private client: AxiosInstance;
    private baseUrl: string;
    private apiKey: string;
    private useProduction: boolean;

    constructor(useProduction: boolean = false) {
        // Load standardized deployment config
        const deploymentConfig = getDeploymentConfig();
        const dsoConfig = deploymentConfig.dso;

        // Support legacy useProduction flag, but prefer DSO_ENV from config
        this.useProduction = useProduction || (dsoConfig.env === 'prod');

        // Use standardized config, with fallback to legacy env vars for backward compatibility
        this.apiKey = dsoConfig.apiKey;

        if (!this.apiKey) {
            throw new Error(
                `DSO API key not configured. Set DSO_API_KEY (or legacy DSO_${this.useProduction ? 'PROD' : 'PREPROD'}_KEY) in .env`
            );
        }

        // Catalogus API uses the same environment as other DSO APIs
        // Base URL is derived from DSO_ENV, but we need to construct it from the pattern
        // Since catalogus doesn't have a separate config, we derive it from the environment
        this.baseUrl = this.useProduction
            ? 'https://service.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3'
            : 'https://service.pre.omgevingswet.overheid.nl/publiek/catalogus/api/opvragen/v3';

        // Use centralized HTTP client for connection pooling and retry logic
        // Migrated from direct axios.create() to centralized client (WI-377)
        this.client = createHttpClient({
            baseURL: this.baseUrl,
            timeout: HTTP_TIMEOUTS.STANDARD, // 30 seconds
            headers: {
                'X-API-KEY': this.apiKey,
                'Accept': 'application/json, application/ld+json, */*', // Try multiple content types
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Check API health
     * Tries multiple health endpoints, falls back to actual API call
     */
    async checkHealth(): Promise<boolean> {
        const healthEndpoints = ['/app-health', '/health', '/app-info'];
        
        for (const endpoint of healthEndpoints) {
            try {
                const response = await this.client.get(endpoint);
                if (response.status === 200) {
                    return true;
                }
            } catch (error) {
                // Try next endpoint
                continue;
            }
        }
        
        // If all health endpoints fail, try a simple API call to verify connectivity
        try {
            const response = await this.client.get('/begrippen', { params: { pageSize: 1 } });
            return response.status === 200;
        } catch (error) {
            console.error('[DSO Catalogus] Health check failed:', error);
            return false;
        }
    }

    /**
     * Get all begrippen (terms/concepts)
     */
    async getBegrippen(options: DSOCatalogusOptions = {}): Promise<DSOCatalogusResponse> {
        try {
            // Build query string manually to handle API requirements
            const params: string[] = [];
            if (options.domein) params.push(`domein=${encodeURIComponent(options.domein)}`);
            if (options.collectie) params.push(`collectie=${encodeURIComponent(options.collectie)}`);
            if (options.query) params.push(`query=${encodeURIComponent(options.query)}`);
            if (options.page) params.push(`page=${options.page}`);
            if (options.pageSize) params.push(`pageSize=${options.pageSize}`);

            const queryString = params.length > 0 ? `?${params.join('&')}` : '';
            const response = await this.client.get(`/begrippen${queryString}`);
            return this.parseResponse(response.data);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[DSO Catalogus] Error fetching begrippen:', error.response?.status, error.response?.statusText);
                console.error('[DSO Catalogus] Response:', error.response?.data);
            } else {
                console.error('[DSO Catalogus] Error fetching begrippen:', error);
            }
            throw new Error(`Failed to fetch begrippen: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get a specific begrip by ID
     */
    async getBegrip(id: string): Promise<DSOConcept | null> {
        try {
            const response = await this.client.get(`/begrippen/${id}`);
            return this.parseConcept(response.data);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null;
            }
            console.error(`[DSO Catalogus] Error fetching begrip ${id}:`, error);
            throw new Error(`Failed to fetch begrip: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get activiteiten (activities)
     */
    async getActiviteiten(options: DSOCatalogusOptions = {}): Promise<DSOCatalogusResponse> {
        try {
            const params: Record<string, string | number> = {};
            if (options.domein) params.domein = options.domein;
            if (options.query) params.query = options.query;
            if (options.page) params.page = options.page;
            if (options.pageSize) params.pageSize = options.pageSize;

            const response = await this.client.get('/activiteiten', { params });
            return this.parseResponse(response.data);
        } catch (error) {
            console.error('[DSO Catalogus] Error fetching activiteiten:', error);
            throw new Error(`Failed to fetch activiteiten: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get werkzaamheden (work activities)
     */
    async getWerkzaamheden(options: DSOCatalogusOptions = {}): Promise<DSOCatalogusResponse> {
        try {
            const params: Record<string, string | number> = {};
            if (options.domein) params.domein = options.domein;
            if (options.query) params.query = options.query;
            if (options.page) params.page = options.page;
            if (options.pageSize) params.pageSize = options.pageSize;

            const response = await this.client.get('/werkzaamheden', { params });
            return this.parseResponse(response.data);
        } catch (error) {
            console.error('[DSO Catalogus] Error fetching werkzaamheden:', error);
            throw new Error(`Failed to fetch werkzaamheden: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get collecties (collections)
     */
    async getCollecties(): Promise<DSOCatalogusResponse> {
        try {
            const response = await this.client.get('/collecties');
            return this.parseResponse(response.data);
        } catch (error) {
            console.error('[DSO Catalogus] Error fetching collecties:', error);
            throw new Error(`Failed to fetch collecties: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search begrippen by query
     * Note: The /begrippen endpoint doesn't support a 'query' parameter.
     * This method fetches begrippen and filters client-side.
     * For server-side search, use a different endpoint if available.
     */
    async searchBegrippen(query: string, limit: number = 100): Promise<DSOConcept[]> {
        try {
            // Fetch all begrippen and filter client-side
            // Note: This is inefficient for large datasets, but the API doesn't support query parameter
            const validPageSize: 10 | 20 | 40 | 100 = 100;
            const response = await this.getBegrippen({ pageSize: validPageSize });
            
            // Filter client-side by label, definitie, or uitleg
            const queryLower = query.toLowerCase();
            const filtered = response.items.filter(begrip => 
                begrip.label.toLowerCase().includes(queryLower) ||
                begrip.definitie?.toLowerCase().includes(queryLower) ||
                begrip.uitleg?.toLowerCase().includes(queryLower)
            );
            
            return filtered.slice(0, limit);
        } catch (error) {
            console.error('[DSO Catalogus] Error searching begrippen:', error);
            throw error;
        }
    }

    /**
     * Get all begrippen (with pagination)
     */
    async getAllBegrippen(maxItems?: number): Promise<DSOConcept[]> {
        const allItems: DSOConcept[] = [];
        let page = 1;
        const pageSize: 10 | 20 | 40 | 100 = 100; // Use maximum allowed page size

        try {
            while (true) {
                const response = await this.getBegrippen({ page, pageSize });
                allItems.push(...response.items);

                if (maxItems && allItems.length >= maxItems) {
                    return allItems.slice(0, maxItems);
                }

                // Check if there are more pages
                if (!response.items.length || (response.total && allItems.length >= response.total)) {
                    break;
                }

                page++;
            }

            return allItems;
        } catch (error) {
            console.error('[DSO Catalogus] Error fetching all begrippen:', error);
            throw error;
        }
    }

    /**
     * Parse API response
     */
    private parseResponse(data: unknown): DSOCatalogusResponse {
        // Handle different response formats
        if (Array.isArray(data)) {
            return {
                items: data.map(item => this.parseConcept(item)),
                total: data.length
            };
        }

        if (typeof data === 'object' && data !== null) {
            const obj = data as Record<string, unknown>;
            return {
                items: Array.isArray(obj.items) 
                    ? obj.items.map((item: unknown) => this.parseConcept(item))
                    : [],
                total: typeof obj.total === 'number' ? obj.total : undefined,
                page: typeof obj.page === 'number' ? obj.page : undefined,
                pageSize: typeof obj.pageSize === 'number' ? obj.pageSize : undefined
            };
        }

        return { items: [] };
    }

    /**
     * Parse a single concept from API response
     */
    private parseConcept(data: unknown): DSOConcept {
        if (typeof data !== 'object' || data === null) {
            throw new Error('Invalid concept data');
        }

        const obj = data as Record<string, unknown>;

        return {
            id: String(obj.id || obj['@id'] || ''),
            label: String(obj.label || obj.naam || obj.titel || ''),
            definitie: obj.definitie ? String(obj.definitie) : undefined,
            uitleg: obj.uitleg ? String(obj.uitleg) : undefined,
            bron: obj.bron ? String(obj.bron) : undefined,
            publicatiedatum: obj.publicatiedatum ? String(obj.publicatiedatum) : undefined,
            vervaldatum: obj.vervaldatum ? String(obj.vervaldatum) : undefined,
            geldigheidsdatum: obj.geldigheidsdatum ? String(obj.geldigheidsdatum) : undefined,
            vervaldatumGeldigheid: obj.vervaldatumGeldigheid ? String(obj.vervaldatumGeldigheid) : undefined,
            gerelateerdeBegrippen: Array.isArray(obj.gerelateerdeBegrippen)
                ? obj.gerelateerdeBegrippen.map((rel: unknown) => this.parseRelation(rel))
                : undefined,
            generalisatie: Array.isArray(obj.generalisatie) 
                ? obj.generalisatie.map((g: unknown) => String(g))
                : undefined,
            specialisatie: Array.isArray(obj.specialisatie)
                ? obj.specialisatie.map((s: unknown) => String(s))
                : undefined,
            onderdeelVan: Array.isArray(obj.onderdeelVan)
                ? obj.onderdeelVan.map((o: unknown) => String(o))
                : undefined,
            bestaatUit: Array.isArray(obj.bestaatUit)
                ? obj.bestaatUit.map((b: unknown) => String(b))
                : undefined,
            domein: obj.domein ? String(obj.domein) : undefined,
            collectie: obj.collectie ? String(obj.collectie) : undefined,
            bronhouder: obj.bronhouder ? String(obj.bronhouder) : undefined
        };
    }

    /**
     * Parse a relation
     */
    private parseRelation(data: unknown): DSORelation {
        if (typeof data !== 'object' || data === null) {
            throw new Error('Invalid relation data');
        }

        const obj = data as Record<string, unknown>;

        return {
            type: this.parseRelationType(obj.type),
            gerelateerdBegrip: String(obj.gerelateerdBegrip || obj['@id'] || ''),
            label: obj.label ? String(obj.label) : undefined
        };
    }

    /**
     * Parse relation type
     */
    private parseRelationType(type: unknown): DSORelation['type'] {
        const typeStr = String(type || '').toLowerCase();
        if (typeStr.includes('generalisatie')) return 'generalisatie';
        if (typeStr.includes('specialisatie')) return 'specialisatie';
        if (typeStr.includes('onderdeel')) return 'onderdeel';
        if (typeStr.includes('bestaat')) return 'bestaatUit';
        return 'semantisch';
    }
}

