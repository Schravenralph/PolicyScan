/**
 * Data transformation utilities
 * Pure functions for transforming data between different formats
 */
export interface BronWebsite {
    _id?: string;
    titel: string;
    url: string;
    samenvatting: string;
    'relevantie voor zoekopdracht'?: string;
    website_types?: string[];
    accepted: boolean | null;
}
/**
 * @deprecated This type is deprecated. Use CanonicalDocument instead.
 * This type is only provided for backward compatibility in deprecated code paths.
 * See WI-421: Legacy Code Cleanup - BronDocument Interfaces
 */
export type BronDocument = Record<string, unknown> & {
    _id?: string;
    titel: string;
    url: string;
    samenvatting: string;
    'relevantie voor zoekopdracht'?: string;
    type_document?: string;
    accepted?: boolean | null;
};
export interface CanonicalDocument {
    _id: string;
    title: string;
    canonicalUrl?: string;
    fullText: string;
    documentType: string;
    dates: {
        publishedAt?: Date | string;
        validFrom?: Date | string;
        validTo?: Date | string;
    };
    sourceMetadata: Record<string, unknown>;
    enrichmentMetadata?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface Bron {
    _id?: string;
    id: string;
    titel: string;
    url: string;
    samenvatting: string;
    relevantie: string;
    bron: string;
    status: 'pending' | 'approved' | 'rejected';
    type: 'website' | 'document';
    metadata?: {
        documentType: string | null;
        publicationDate: string | null;
        themes: string[];
        issuingAuthority: string | null;
        documentStatus: string | null;
        metadataConfidence?: number;
        hierarchyLevel?: 'municipality' | 'province' | 'national' | 'european';
        jurisdictionId?: string;
    };
}
/**
 * Transforms a BronWebsite to a Bron object
 * @param website - The BronWebsite to transform
 * @returns Bron object
 */
export declare function transformWebsiteToBron(website: BronWebsite): Bron;
/**
 * Transforms a CanonicalDocument to a Bron object
 * @param doc - The CanonicalDocument to transform
 * @returns Bron object
 */
export declare function transformCanonicalDocumentToBron(doc: CanonicalDocument): Bron;
/**
 * Transforms a CanonicalDocument to a Bron object (legacy support for backward compatibility)
 * @param doc - The CanonicalDocument to transform
 * @returns Bron object
 * @deprecated Use transformCanonicalDocumentToBron instead (this is an alias for backward compatibility)
 */
export declare function transformDocumentToBron(doc: CanonicalDocument): Bron;
/**
 * Transforms an array of BronWebsites to Bron objects
 * @param websites - Array of BronWebsites
 * @returns Array of Bron objects
 */
export declare function transformWebsitesToBronnen(websites: BronWebsite[]): Bron[];
/**
 * Transforms an array of CanonicalDocuments to Bron objects
 * @param documents - Array of CanonicalDocuments
 * @returns Array of Bron objects
 */
export declare function transformCanonicalDocumentsToBronnen(documents: CanonicalDocument[]): Bron[];
/**
 * Transforms an array of CanonicalDocuments to Bron objects (legacy support for backward compatibility)
 * @param documents - Array of CanonicalDocuments
 * @returns Array of Bron objects
 * @deprecated Use transformCanonicalDocumentsToBronnen instead (this is an alias for backward compatibility)
 */
export declare function transformDocumentsToBronnen(documents: CanonicalDocument[]): Bron[];
/**
 * Transforms a created CanonicalDocument from API to a Bron object
 * @param createdDocument - The created CanonicalDocument from API
 * @returns Bron object
 */
export declare function transformCreatedDocumentToBron(createdDocument: CanonicalDocument): Bron;
