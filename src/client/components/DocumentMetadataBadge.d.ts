export interface DocumentMetadata {
    documentType?: string | null;
    publicationDate?: string | Date | null;
    themes?: string[];
    issuingAuthority?: string | null;
    documentStatus?: string | null;
    metadataConfidence?: number;
    hierarchyLevel?: 'municipality' | 'province' | 'national' | 'european';
    jurisdictionId?: string;
}
export interface DocumentMetadataBadgeProps {
    metadata: DocumentMetadata;
    showConfidence?: boolean;
    className?: string;
}
export declare function DocumentMetadataBadge({ metadata, showConfidence, className }: DocumentMetadataBadgeProps): import("react/jsx-runtime").JSX.Element;
