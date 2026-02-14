/**
 * PublicationTypeBadge Component
 *
 * Displays badges for official publication types (Gemeenteblad, Staatscourant, etc.)
 * Only shown for SRU documents (identified by specific publication types)
 */
import React from 'react';
export interface PublicationTypeBadgeProps {
    /** Publication type (e.g., "Gemeenteblad", "Staatscourant") */
    publicationType: string | null | undefined;
    /** Document type from metadata (used as fallback) */
    documentType?: string | null | undefined;
    /** Source type (if available) */
    sourceType?: string | null | undefined;
    /** Additional CSS classes */
    className?: string;
}
/**
 * PublicationTypeBadge Component
 *
 * Displays a badge for official publication types (Gemeenteblad, Staatscourant, etc.)
 * Only shown for SRU documents (identified by sourceType or publication type)
 */
export declare const PublicationTypeBadge: React.FC<PublicationTypeBadgeProps>;
