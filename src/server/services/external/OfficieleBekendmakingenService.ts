/**
 * Service for searching Officiëlebekendmakingen.nl for official publications
 * 
 * This service uses SRU (Search and Retrieval via URL) protocol to query the
 * KOOP (Kennis- en Exploitatiecentrum Officiële Overheidspublicaties) repository
 * at https://repository.overheid.nl/sru
 * 
 * This replaces the previous Google Custom Search API approach, providing:
 * - Direct access to structured government data
 * - No API costs
 * - Legally permanent document links (ELI - Electronic Law Identifier)
 * - Better reliability and data quality
 * 
 * Research Documentation: docs/30-officielebekendmakingen/API-RESEARCH.md
 */

import { SruService, SruQueryParams, type Overheidslaag } from './SruService.js';
import { DiscoveredDocument } from './DSOOntsluitenService.js';
import { logger } from '../../utils/logger.js';

/**
 * Search query parameters for official publications
 */
export interface OfficieleBekendmakingenSearchQuery {
    /** Topic/query terms */
    query: string;
    /** Optional: Issuing authority (bevoegd gezag) */
    authority?: string;
    /** Optional: Government level filter (Rijk, Provincie, Gemeente, Waterschap) */
    overheidslaag?: Overheidslaag;
    /** Optional: Publication type filter (verordening, beleidsregel, besluit, etc.) */
    publicationType?: string;
    /** Optional: Date range filter */
    dateRange?: {
        from?: string;
        to?: string;
    };
    /** Optional: Maximum number of results */
    maxResults?: number;
}

/**
 * Service for searching Officiëlebekendmakingen.nl
 */
export class OfficieleBekendmakingenService {
    private sruService: SruService;

    constructor(sruService?: SruService) {
        // Use provided service or create new instance
        this.sruService = sruService || new SruService();
    }

    /**
     * Check if the service is configured (always true for SRU as it's a public API)
     */
    isConfigured(): boolean {
        return this.sruService.isConfigured();
    }

    /**
     * Search for official publications
     * 
     * Uses SRU (Search and Retrieval via URL) protocol to query the KOOP repository
     * for official government publications.
     */
    async searchPublications(
        query: OfficieleBekendmakingenSearchQuery
    ): Promise<DiscoveredDocument[]> {
        if (!this.isConfigured()) {
            logger.warn('SRU service not configured. OfficieleBekendmakingenService requires SRU service.');
            return [];
        }

        try {
            // Map publication type to SRU type filter
            // Common types: Gemeenteblad, Staatscourant, Provinciaalblad
            let sruType: string | undefined;
            if (query.publicationType) {
                // Map common publication types to SRU type values
                const typeLower = query.publicationType.toLowerCase();
                if (typeLower.includes('gemeenteblad') || typeLower.includes('gmb')) {
                    sruType = 'Gemeenteblad';
                } else if (typeLower.includes('staatscourant') || typeLower.includes('stb')) {
                    sruType = 'Staatscourant';
                } else if (typeLower.includes('provinciaalblad') || typeLower.includes('prb')) {
                    sruType = 'Provinciaalblad';
                } else {
                    sruType = query.publicationType;
                }
            }

            // Build SRU query parameters
            const sruParams: SruQueryParams = {
                onderwerp: query.query,
                authority: query.authority,
                overheidslaag: query.overheidslaag,
                type: sruType,
                dateFrom: query.dateRange?.from,
                dateTo: query.dateRange?.to,
                maxResults: query.maxResults || 20
            };

            // Search using SRU service
            const documents = await this.sruService.fetchDocuments(sruParams);

            logger.info(
                { count: documents.length, query: query.query },
                'Found official publications via SRU'
            );

            return documents;
        } catch (error) {
            logger.error(
                { error, query: query.query },
                'Error searching Officiële Bekendmakingen.nl via SRU'
            );
            // Return empty array on error (don't break workflow)
            return [];
        }
    }

}
