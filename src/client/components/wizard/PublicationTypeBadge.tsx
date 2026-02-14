/**
 * PublicationTypeBadge Component
 * 
 * Displays badges for official publication types (Gemeenteblad, Staatscourant, etc.)
 * Only shown for SRU documents (identified by specific publication types)
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { FileText } from 'lucide-react';

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
 * Official publication types from SRU
 */
const OFFICIAL_PUBLICATION_TYPES = [
  'Gemeenteblad',
  'Staatscourant',
  'Provinciaalblad',
  'Waterschapsblad',
] as const;

type OfficialPublicationType = typeof OFFICIAL_PUBLICATION_TYPES[number];

/**
 * Badge configuration for each publication type
 */
/**
 * Badge configuration for each publication type (using semantic classes)
 */
const BADGE_CONFIG: Record<OfficialPublicationType, { label: string; className: string }> = {
  Gemeenteblad: {
    label: 'Gemeenteblad',
    className: 'border-primary text-primary bg-primary/10',
  },
  Staatscourant: {
    label: 'Staatscourant',
    className: 'border-destructive text-destructive bg-destructive/10',
  },
  Provinciaalblad: {
    label: 'Provinciaalblad',
    className: 'border-muted-foreground text-muted-foreground bg-muted/10',
  },
  Waterschapsblad: {
    label: 'Waterschapsblad',
    className: 'border-primary text-primary bg-primary/10',
  },
};

/**
 * Checks if a publication type is an official publication type
 */
function isOfficialPublicationType(type: string | null | undefined): type is OfficialPublicationType {
  if (!type) return false;
  return OFFICIAL_PUBLICATION_TYPES.includes(type as OfficialPublicationType);
}

/**
 * Determines if this document is from SRU (official publications)
 */
function isSruDocument(
  publicationType: string | null | undefined,
  documentType: string | null | undefined,
  sourceType: string | null | undefined
): boolean {
  // Check sourceType first (most reliable)
  if (sourceType === 'OFFICIELEBEKENDMAKINGEN') {
    return true;
  }

  // Check if publicationType or documentType matches official publication types
  return isOfficialPublicationType(publicationType) || isOfficialPublicationType(documentType);
}

/**
 * Gets the publication type from props
 */
function getPublicationType(
  publicationType: string | null | undefined,
  documentType: string | null | undefined
): OfficialPublicationType | null {
  if (isOfficialPublicationType(publicationType)) {
    return publicationType;
  }
  if (isOfficialPublicationType(documentType)) {
    return documentType;
  }
  return null;
}

/**
 * PublicationTypeBadge Component
 * 
 * Displays a badge for official publication types (Gemeenteblad, Staatscourant, etc.)
 * Only shown for SRU documents (identified by sourceType or publication type)
 */
export const PublicationTypeBadge: React.FC<PublicationTypeBadgeProps> = ({
  publicationType,
  documentType,
  sourceType,
  className = '',
}) => {
  // Check if this is an SRU document
  if (!isSruDocument(publicationType, documentType, sourceType)) {
    return null;
  }

  // Get the publication type
  const type = getPublicationType(publicationType, documentType);
  if (!type) {
    return null;
  }

  // Get badge configuration
  const config = BADGE_CONFIG[type];

  return (
    <Badge
      variant="outline"
      className={`text-xs flex items-center gap-1 ${config.className} ${className}`}
      aria-label={`Publicatietype: ${config.label}`}
    >
      <FileText className="w-3 h-3" />
      {config.label}
    </Badge>
  );
};

