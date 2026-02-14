import { Badge } from './ui/badge';
import { Calendar, FileText, Tag, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import { t } from '../utils/i18n';

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

// Color mapping for document types
// Color mapping for document types (returning semantic classes)
const getDocumentTypeClasses = (type: string | null | undefined): string => {
  if (!type) return 'border-muted-foreground text-muted-foreground bg-muted/10';

  const typeLower = type.toLowerCase();
  if (typeLower.includes('beleid') || typeLower.includes('beleidsnota') || typeLower.includes('beleidsregel')) {
    return 'border-primary text-primary bg-primary/10'; // Policy
  }
  if (typeLower.includes('plan') || typeLower.includes('bestemmingsplan') || typeLower.includes('omgevingsplan')) {
    return 'border-destructive text-destructive bg-destructive/10'; // Plans (using destructive/orange equivalent)
  }
  if (typeLower.includes('visie') || typeLower.includes('structuurvisie')) {
    return 'border-muted-foreground text-muted-foreground bg-muted/10'; // Vision
  }
  if (typeLower.includes('verordening') || typeLower.includes('besluit')) {
    return 'border-foreground text-foreground bg-foreground/10'; // Regulations
  }
  return 'border-muted-foreground text-muted-foreground bg-muted/10'; // Default
};

// Format date to Dutch format
const formatDutchDate = (date: string | Date | null | undefined): string => {
  if (!date) return t('common.unknown');

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return t('common.unknown');

    const months = [
      'januari', 'februari', 'maart', 'april', 'mei', 'juni',
      'juli', 'augustus', 'september', 'oktober', 'november', 'december'
    ];

    const day = dateObj.getDate();
    const month = months[dateObj.getMonth()];
    const year = dateObj.getFullYear();

    return `${day} ${month} ${year}`;
  } catch {
    return t('common.unknown');
  }
};

export function DocumentMetadataBadge({ metadata, showConfidence = false, className = '' }: DocumentMetadataBadgeProps) {
  const hasMetadata = metadata.documentType || metadata.publicationDate ||
    (metadata.themes && metadata.themes.length > 0) ||
    metadata.issuingAuthority || metadata.documentStatus;

  if (!hasMetadata) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        <Badge variant="outline" className="text-xs">
          Geen metadata beschikbaar
        </Badge>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {/* Document Type */}
      {metadata.documentType && (
        <Badge
          variant="outline"
          className={`text-xs flex items-center gap-1 ${getDocumentTypeClasses(metadata.documentType)}`}
        >
          <FileText className="w-3 h-3" />
          {metadata.documentType}
        </Badge>
      )}

      {/* Publication Date */}
      {metadata.publicationDate && (
        <Badge
          variant="outline"
          className="text-xs flex items-center gap-1 border-muted-foreground text-muted-foreground bg-muted/10"
        >
          <Calendar className="w-3 h-3" />
          {formatDutchDate(metadata.publicationDate)}
        </Badge>
      )}

      {/* Themes */}
      {metadata.themes && metadata.themes.length > 0 && (
        <>
          {metadata.themes.slice(0, 3).map((theme, index) => (
            <Badge
              key={index}
              variant="outline"
              className="text-xs flex items-center gap-1 border-primary text-primary bg-primary/10"
            >
              <Tag className="w-3 h-3" />
              {theme}
            </Badge>
          ))}
          {metadata.themes.length > 3 && (
            <Badge
              variant="outline"
              className="text-xs border-primary text-primary bg-primary/10"
            >
              +{metadata.themes.length - 3} meer
            </Badge>
          )}
        </>
      )}

      {/* Issuing Authority */}
      {metadata.issuingAuthority && (
        <Badge
          variant="outline"
          className="text-xs flex items-center gap-1 border-foreground text-foreground bg-foreground/10"
        >
          <Building2 className="w-3 h-3" />
          {metadata.issuingAuthority}
        </Badge>
      )}

      {/* Document Status */}
      {metadata.documentStatus && (
        <Badge
          variant="outline"
          className={`text-xs flex items-center gap-1 ${metadata.documentStatus.toLowerCase().includes('definitief') ||
              metadata.documentStatus.toLowerCase().includes('final')
              ? 'border-primary text-primary bg-primary/10'
              : 'border-muted-foreground text-muted-foreground bg-muted/10'
            }`}
        >
          {metadata.documentStatus.toLowerCase().includes('definitief') ||
            metadata.documentStatus.toLowerCase().includes('final') ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          {metadata.documentStatus}
        </Badge>
      )}

      {/* Confidence Indicator (optional, for admin/debug) */}
      {showConfidence && metadata.metadataConfidence !== undefined && (
        <Badge
          variant="outline"
          className={`text-xs ${metadata.metadataConfidence > 0.7
              ? 'border-primary text-primary bg-primary/10'
              : metadata.metadataConfidence > 0.4
                ? 'border-muted-foreground text-muted-foreground bg-muted/10'
                : 'border-destructive text-destructive bg-destructive/10'
            }`}
        >
          Vertrouwen: {Math.round(metadata.metadataConfidence * 100)}%
        </Badge>
      )}
    </div>
  );
}

