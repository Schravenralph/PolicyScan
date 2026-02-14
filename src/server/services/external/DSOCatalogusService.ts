/**
 * Service for querying the DSO Stelselcatalogus API
 * 
 * The Stelselcatalogus provides vocabulary and concepts for the Omgevingswet (Environment Act),
 * focusing on urban planning, spatial regulations, and environmental policy.
 * 
 * API Documentation: https://developer.omgevingswet.overheid.nl/api-register/api/catalogus-opvragen/
 */

import axios, { AxiosInstance } from 'axios';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { logger } from '../../utils/logger.js';
import { ServiceUnavailableError, ExternalServiceError, BadRequestError } from '../../types/errors.js';

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

    constructor(useProduction: boolean = false) {
        // Load standardized deployment config
        const deploymentConfig = getDeploymentConfig();
        const dsoConfig = deploymentConfig.dso;

        // Support legacy useProduction flag, but prefer DSO_ENV from config
        const isProd = useProduction || (dsoConfig.env === 'prod');

        // Use standardized config, with fallback to legacy env vars for backward compatibility
        this.apiKey = dsoConfig.apiKey;

        if (!this.apiKey) {
            throw new ServiceUnavailableError(
                `DSO API key not configured. Set DSO_API_KEY (or legacy DSO_${isProd ? 'PROD' : 'PREPROD'}_KEY) in .env`,
                {
                    reason: 'dso_api_key_not_configured',
                    environment: isProd ? 'production' : 'preproduction',
                    operation: 'constructor'
                }
            );
        }

        // Catalogus API uses the same environment as other DSO APIs
        // Base URL is derived from DSO_ENV, but we need to construct it from the pattern
        // Since catalogus doesn't have a separate config, we derive it from the environment
        this.baseUrl = isProd
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
            } catch (_error) {
                // Try next endpoint
                continue;
            }
        }
        
        // If all health endpoints fail, try a simple API call to verify connectivity
        try {
            const response = await this.client.get('/begrippen', { params: { pageSize: 1 } });
            return response.status === 200;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'DSO Catalogus health check failed');
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (axios.isAxiosError(error)) {
                logger.error(
                    {
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                        responseData: error.response?.data
                    },
                    'DSO Catalogus error fetching begrippen'
                );
            } else {
                logger.error({ error: errorMessage }, 'DSO Catalogus error fetching begrippen');
            }
            throw new ExternalServiceError('DSO Catalogus', `Failed to fetch begrippen: ${errorMessage}`, {
                reason: 'fetch_begrippen_failed',
                operation: 'getBegrippen',
                originalError: errorMessage
            });
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ begripId: id, error: errorMessage }, 'DSO Catalogus error fetching begrip');
            throw new ExternalServiceError('DSO Catalogus', `Failed to fetch begrip: ${errorMessage}`, {
                reason: 'fetch_begrip_failed',
                operation: 'getBegrip',
                begripId: id,
                originalError: errorMessage
            });
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'DSO Catalogus error fetching activiteiten');
            throw new ExternalServiceError('DSO Catalogus', `Failed to fetch activiteiten: ${errorMessage}`, {
                reason: 'fetch_activiteiten_failed',
                operation: 'getActiviteiten',
                originalError: errorMessage
            });
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'DSO Catalogus error fetching werkzaamheden');
            throw new ExternalServiceError('DSO Catalogus', `Failed to fetch werkzaamheden: ${errorMessage}`, {
                reason: 'fetch_werkzaamheden_failed',
                operation: 'getWerkzaamheden',
                originalError: errorMessage
            });
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage }, 'DSO Catalogus error fetching collecties');
            throw new ExternalServiceError('DSO Catalogus', `Failed to fetch collecties: ${errorMessage}`, {
                reason: 'fetch_collecties_failed',
                operation: 'getCollecties',
                originalError: errorMessage
            });
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ query, error: errorMessage }, 'DSO Catalogus error searching begrippen');
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ maxItems, error: errorMessage }, 'DSO Catalogus error fetching all begrippen');
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
            throw new BadRequestError('Invalid concept data', {
                reason: 'invalid_concept_data',
                operation: 'parseConcept'
            });
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
            throw new BadRequestError('Invalid relation data', {
                reason: 'invalid_relation_data',
                operation: 'parseRelation'
            });
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
