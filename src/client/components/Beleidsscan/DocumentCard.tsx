/**
 * DocumentCard Component
 * 
 * ✅ **MIGRATED** - Uses CanonicalDocument directly.
 * Replaces BronCard usage with native implementation.
 * 
 * @see WI-MIGRATION-002: Migrate DocumentCard to CanonicalDocument
 */

import React, { useState, useMemo, memo } from 'react';
import { Eye } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { CanonicalDocumentCard } from '../CanonicalDocumentCard';
import { DocumentMetadataTooltip } from './DocumentMetadataTooltip';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { getStrategyDescription } from '../../utils/aiCrawlingUtils';
import {
  getCanonicalDocumentTitle,
  getCanonicalDocumentUrl,
  getCanonicalDocumentStatus,
  getCanonicalDocumentId,
} from '../../utils/canonicalDocumentUtils';
import { t } from '../../utils/i18n';


interface DocumentExplanation {
    explanation: string;
    detailedExplanation: string;
    strategy: string;
    confidence?: number;
    reasoning?: string;
    traceId?: string;
    baseUrl?: string;
    query?: string;
    crawlDate?: Date;
    decisionPath?: Array<{
        step: number;
        decisionType: string;
        reasoning?: string;
        timestamp?: Date;
    }>;
}

interface DocumentCardProps {
  document: CanonicalDocument | LightweightDocument;
  selected: boolean;
  onSelect: (id: string) => void;
  onPreview: (document: CanonicalDocument | LightweightDocument) => void;
  onStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => Promise<void>;
  searchQuery?: string;
}

function DocumentCardComponent({
  document,
  selected,
  onSelect,
  onPreview,
  onStatusChange,
  searchQuery,
}: DocumentCardProps): React.ReactElement {
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState<DocumentExplanation | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  // Get title for accessibility labels and display
  const documentId = getCanonicalDocumentId(document) || '';
  const documentTitle = getCanonicalDocumentTitle(document);
  const documentUrl = getCanonicalDocumentUrl(document) || '';
  const documentStatus = getCanonicalDocumentStatus(document);

  // Extract metadata for display
  const documentData = useMemo(() => {
    const sourceMetadata = (document as { sourceMetadata?: Record<string, unknown> }).sourceMetadata || {};
    const enrichmentMetadata = (document as { enrichmentMetadata?: Record<string, unknown> }).enrichmentMetadata || {};

    // Extract legacy fields from sourceMetadata for backward compatibility if needed,
    // but prefer canonical structure
    const legacyLabel = sourceMetadata.legacyLabel as string | undefined;
    const legacyRelevance = (sourceMetadata.legacyRelevance || sourceMetadata.legacyRelevantie || enrichmentMetadata.relevanceExplanation) as string | undefined;
    const legacyThemes = (sourceMetadata.legacyThemes ?? enrichmentMetadata.themes) as string[] | undefined;
    const legacyIssuingAuthority = (sourceMetadata.legacyIssuingAuthority ?? enrichmentMetadata.issuingAuthority) as string | null | undefined;
    const legacyDocumentStatus = enrichmentMetadata.documentStatus as string | null | undefined;
    const legacyMetadataConfidence = enrichmentMetadata.metadataConfidence as number | undefined;

    // Extract summary from fullText or fullTextPreview
    // Note: fullText is stripped from state to prevent 64MB DevTools limit
    // Use fullTextPreview if available, otherwise try fullText (for backward compatibility)
    const fullText = (document as { fullTextPreview?: string; fullText?: string }).fullTextPreview || 
                     (document as { fullText?: string }).fullText || '';
    const firstParagraph = fullText.split('\n\n')[0];
    const samenvatting = firstParagraph
        ? (firstParagraph.length > 500 ? firstParagraph.substring(0, 500) : firstParagraph)
        : (fullText.length > 500 ? fullText.substring(0, 500) : fullText);

    return {
        id: documentId,
        titel: documentTitle,
        url: documentUrl,
        samenvatting: samenvatting,
        relevantie: legacyRelevance || '',
        bron: legacyLabel || document.documentType || 'Document',
        status: documentStatus,
        type: 'document' as const,
        metadata: {
            documentType: document.documentType || null,
            publicationDate: (() => {
              const doc = document as CanonicalDocument | LightweightDocument;
              const dates = doc.dates as { publishedAt?: Date | string } | undefined;
              if (!dates?.publishedAt) return null;
              const publishedAt = dates.publishedAt;
              return typeof publishedAt === 'string' ? publishedAt : (publishedAt instanceof Date ? publishedAt.toISOString().split('T')[0] : String(publishedAt));
            })(),
            themes: legacyThemes || [],
            issuingAuthority: legacyIssuingAuthority || null,
            documentStatus: legacyDocumentStatus || null,
            metadataConfidence: legacyMetadataConfidence,
            hierarchyLevel: (enrichmentMetadata.hierarchyLevel || sourceMetadata.hierarchyLevel) as 'municipality' | 'province' | 'national' | 'european' | undefined,
            jurisdictionId: (enrichmentMetadata.jurisdictionId || sourceMetadata.jurisdictionId) as string | undefined,
        },
    };
  }, [document, documentId, documentTitle, documentUrl, documentStatus]);

  // Unused function - kept for potential future use
        // @ts-expect-error - Unused function kept for future use
  const _handleShowExplanation = async () => {
    setShowExplanation(true);
    setExplanationError(null);
    if (!explanation && !loadingExplanation) {
        setLoadingExplanation(true);
        try {
            const exp = await api.getDocumentExplanation(documentData.url);
            if (exp) {
                setExplanation(exp);
            } else {
                setExplanationError('Geen uitleg beschikbaar');
            }
        } catch (error) {
            logError(error, 'load-explanation');
            setExplanationError('Kon uitleg niet laden. Probeer het later opnieuw.');
        } finally {
            setLoadingExplanation(false);
        }
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
        setExplanationError(null);
    }
    setShowExplanation(open);
  };

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        checked={selected}
        onCheckedChange={() => onSelect(documentId)}
        className="mt-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
        aria-label={`${selected ? t('common.deselect') : t('common.select')} document ${documentTitle}`}
      />

      <div className="flex-1">
        <DocumentMetadataTooltip document={document}>
          <CanonicalDocumentCard
            document={document}
            onStatusChange={onStatusChange}
            searchQuery={searchQuery}
          />
        </DocumentMetadataTooltip>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPreview(document)}
        className="mt-2 border-primary text-primary hover:bg-primary/10"
        aria-label={`Preview document ${documentTitle}`}
      >
        <Eye className="w-4 h-4 mr-2" aria-hidden="true" />
        Preview
      </Button>

      {/* Document Explanation Dialog */}
      <Dialog open={showExplanation} onOpenChange={handleDialogClose}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto ">
              <DialogHeader>
                  <DialogTitle>{t('documentCard.whyFound')}</DialogTitle>
                  <DialogDescription>
                      Uitleg over hoe dit document is ontdekt tijdens het AI-geleide crawlen
                  </DialogDescription>
              </DialogHeader>
              {loadingExplanation ? (
                  <div className="flex items-center justify-center p-8" role="status">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <span className="sr-only">{t('documentCard.loadingExplanation')}</span>
                  </div>
              ) : explanationError ? (
                  <div className="text-center text-red-500 p-8">
                      {explanationError}
                  </div>
              ) : explanation ? (
                  <div className="space-y-4 mt-4">
                      <div>
                          <h3 className="font-semibold mb-2">Strategie</h3>
                          <p className="text-sm text-muted-foreground">
                              {getStrategyDescription(explanation.strategy)}
                          </p>
                      </div>
                      {explanation.confidence !== undefined && (
                          <div>
                              <h3 className="font-semibold mb-2">Vertrouwensscore</h3>
                              <p className="text-sm text-muted-foreground">
                                  {(explanation.confidence * 100).toFixed(0)}% - {
                                      explanation.confidence >= 0.8 ? 'Hoge vertrouwen - zeer waarschijnlijk relevant' :
                                      explanation.confidence >= 0.5 ? 'Gemiddeld vertrouwen - waarschijnlijk relevant' :
                                      'Lager vertrouwen - mogelijk review nodig'
                                  }
                              </p>
                          </div>
                      )}
                      {explanation.reasoning && (
                          <div>
                              <h3 className="font-semibold mb-2">Redenering</h3>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{explanation.reasoning}</p>
                          </div>
                      )}
                      {explanation.detailedExplanation && (
                          <div>
                              <h3 className="font-semibold mb-2">Gedetailleerde uitleg</h3>
                              <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded">
                                  {explanation.detailedExplanation}
                              </pre>
                          </div>
                      )}
                      {explanation.decisionPath && explanation.decisionPath.length > 0 && (
                          <div>
                              <h3 className="font-semibold mb-2">Beslissingspad</h3>
                              <div className="space-y-2">
                                  {explanation.decisionPath.map((step, index: number) => (
                                      <div key={index} className="border-l-2 border-blue-500 pl-4 py-2">
                                          <div className="font-medium text-sm">{step.step}. {step.decisionType}</div>
                                          {step.reasoning && (
                                              <div className="text-xs text-muted-foreground mt-1">{step.reasoning}</div>
                                          )}
                                          {step.timestamp && (
                                              <div className="text-xs text-muted-foreground mt-1">
                                                  {new Date(step.timestamp).toLocaleString('nl-NL')}
                                              </div>
                                          )}
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              ) : (
                  <div className="text-center text-muted-foreground p-8">
                      Geen uitleg beschikbaar voor dit document. Dit document is mogelijk niet gevonden via AI-geleide crawling.
                  </div>
              )}
          </DialogContent>
      </Dialog>
    </div>
  );
}

// Memoize DocumentCard to prevent unnecessary re-renders when parent re-renders
// Only re-render if props actually change
export const DocumentCard = memo(DocumentCardComponent, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  // Re-render if any prop changes
  return (
    prevProps.document._id === nextProps.document._id &&
    prevProps.selected === nextProps.selected &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.onPreview === nextProps.onPreview &&
    prevProps.onStatusChange === nextProps.onStatusChange &&
    prevProps.searchQuery === nextProps.searchQuery &&
    // Deep comparison of document metadata (only check relevant fields)
    prevProps.document.reviewStatus === nextProps.document.reviewStatus &&
    prevProps.document.title === nextProps.document.title
  );
});
