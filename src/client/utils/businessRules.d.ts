/**
 * Business rule utilities
 * Pure functions for business logic that can be reused across components
 */
export type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';
export type AcceptanceStatus = boolean | null;
/**
 * Converts acceptance status (boolean | null) to document status string
 * @param accepted - The acceptance status
 * @returns Document status string
 */
export declare function acceptanceToStatus(accepted: AcceptanceStatus): DocumentStatus;
/**
 * Converts document status string to acceptance status
 * @param status - The document status
 * @returns Acceptance status (boolean | null)
 */
export declare function statusToAcceptance(status: DocumentStatus): AcceptanceStatus;
/**
 * Gets entity list based on selected overheidslaag
 * @param overheidslaag - The selected government level
 * @param entities - Object containing all entity lists
 * @returns Array of entity names
 */
export declare function getEntityList(overheidslaag: WebsiteType | null, entities: {
    gemeenten: string[];
    waterschappen: string[];
    provincies: string[];
    rijksorganisaties: string[];
}): string[];
/**
 * Filters entities by search query
 * @param entities - Array of entity names
 * @param searchQuery - The search query string
 * @returns Filtered array of entity names
 */
export declare function filterEntities(entities: string[], searchQuery: string): string[];
/**
 * Determines if a draft has meaningful state to save
 * @param draft - The draft object
 * @returns True if draft has meaningful state
 */
export declare function hasMeaningfulDraftState(draft: {
    step?: number;
    overheidslaag?: string | null;
    onderwerp?: string;
    selectedEntity?: string;
    selectedWebsites?: string[];
    websiteSearchQuery?: string;
    websiteFilterType?: string | null;
    websiteSortBy?: 'relevance' | 'name' | 'type';
    documents?: unknown[];
    documentSearchQuery?: string;
    documentFilter?: 'all' | 'pending' | 'approved' | 'rejected';
    documentTypeFilter?: string | null;
    documentDateFilter?: 'all' | 'week' | 'month' | 'year';
    documentWebsiteFilter?: string | null;
    documentSortBy?: 'relevance' | 'date' | 'title' | 'website';
    documentSortDirection?: 'asc' | 'desc';
    selectedDocuments?: string[];
}): boolean;
/**
 * Creates default document data for custom document creation
 * @param url - The document URL
 * @param scanParameters - The scan parameters
 * @param queryId - The query ID
 * @returns Document data object
 */
export declare function createCustomDocumentData(url: string, scanParameters: {
    onderwerp?: string;
    entity?: string;
    thema?: string;
}, queryId: string): {
    titel: string;
    url: string;
    website_url: string;
    label: string;
    samenvatting: string;
    'relevantie voor zoekopdracht': string;
    type_document: string;
    subjects: string[];
    themes: string[];
    accepted: null;
    queryId: string;
};
