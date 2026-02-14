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
export function acceptanceToStatus(accepted: AcceptanceStatus): DocumentStatus {
  if (accepted === null) return 'pending';
  return accepted ? 'approved' : 'rejected';
}

/**
 * Converts document status string to acceptance status
 * @param status - The document status
 * @returns Acceptance status (boolean | null)
 */
export function statusToAcceptance(status: DocumentStatus): AcceptanceStatus {
  switch (status) {
    case 'approved':
      return true;
    case 'rejected':
      return false;
    case 'pending':
    default:
      return null;
  }
}

/**
 * Gets entity list based on selected overheidslaag
 * @param overheidslaag - The selected government level
 * @param entities - Object containing all entity lists
 * @returns Array of entity names
 */
export function getEntityList(
  overheidslaag: WebsiteType | null,
  entities: {
    gemeenten: string[];
    waterschappen: string[];
    provincies: string[];
    rijksorganisaties: string[];
  }
): string[] {
  if (!overheidslaag) return [];
  
  switch (overheidslaag) {
    case 'gemeente':
      return entities.gemeenten;
    case 'waterschap':
      return entities.waterschappen;
    case 'provincie':
      return entities.provincies;
    case 'rijk':
      return entities.rijksorganisaties;
    case 'kennisinstituut':
      return [];
    default:
      return [];
  }
}

/**
 * Filters entities by search query
 * @param entities - Array of entity names
 * @param searchQuery - The search query string
 * @returns Filtered array of entity names
 */
export function filterEntities(entities: string[], searchQuery: string): string[] {
  if (!searchQuery || searchQuery.trim().length === 0) {
    return entities;
  }
  const queryLower = searchQuery.toLowerCase();
  return entities.filter((entity) => entity.toLowerCase().includes(queryLower));
}

/**
 * Determines if a draft has meaningful state to save
 * @param draft - The draft object
 * @returns True if draft has meaningful state
 */
export function hasMeaningfulDraftState(draft: {
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
}): boolean {
  const hasStep1State = draft.step === 1 && (
    !!draft.overheidslaag || !!draft.onderwerp || !!draft.selectedEntity
  );
  const hasStep2State = draft.step === 2 && (
    (draft.selectedWebsites?.length ?? 0) > 0 ||
    !!draft.websiteSearchQuery ||
    !!draft.websiteFilterType ||
    draft.websiteSortBy !== 'relevance'
  );
  const hasStep3State = draft.step === 3 && (
    (draft.documents?.length ?? 0) > 0 ||
    !!draft.documentSearchQuery ||
    draft.documentFilter !== 'all' ||
    !!draft.documentTypeFilter ||
    draft.documentDateFilter !== 'all' ||
    !!draft.documentWebsiteFilter ||
    draft.documentSortBy !== 'relevance' ||
    draft.documentSortDirection !== 'desc' ||
    (draft.selectedDocuments?.length ?? 0) > 0
  );
  
  return !!(hasStep1State || hasStep2State || hasStep3State);
}

/**
 * Creates default document data for custom document creation
 * @param url - The document URL
 * @param scanParameters - The scan parameters
 * @param queryId - The query ID
 * @returns Document data object
 */
export function createCustomDocumentData(
  url: string,
  scanParameters: {
    onderwerp?: string;
    entity?: string;
    thema?: string;
  },
  queryId: string
): {
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
} {
  return {
    titel: 'Eigen brondocument',
    url,
    website_url: url,
    label: 'eigen invoer',
    samenvatting: 'Dit is een door u toegevoegd brondocument. De samenvatting wordt automatisch gegenereerd op basis van de inhoud van het document.',
    'relevantie voor zoekopdracht': 'De relevantie van dit document wordt geanalyseerd aan de hand van uw opgegeven zoekparameters.',
    type_document: 'webpagina',
    // Map scanParameters to subjects/themes
    // Use onderwerp if provided, otherwise fall back to entity
    subjects: scanParameters.onderwerp 
      ? [scanParameters.onderwerp] 
      : (scanParameters.entity ? [scanParameters.entity] : []),
    themes: scanParameters.thema ? [scanParameters.thema] : [],
    accepted: null,
    queryId,
  };
}

