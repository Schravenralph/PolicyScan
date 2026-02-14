/**
 * DocumentPreviewModal Component
 * 
 * ✅ **MIGRATED** - Now accepts ONLY CanonicalDocument.
 * Uses canonical document utilities to extract fields consistently.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Globe, FileText, Calendar, ExternalLink, Check, X, Sparkles } from 'lucide-react';
import { toast } from '../../utils/toast';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
import {
  getCanonicalDocumentTitle,
  getCanonicalDocumentUrl,
  getCanonicalDocumentAcceptance,
  getCanonicalDocumentType,
} from '../../utils/canonicalDocumentUtils';
import { t } from '../../utils/i18n';

export interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: CanonicalDocument | LightweightDocument | null;
  onStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => void;
}

/**
 * Modal component for previewing document details before making review decisions.
 * 
 * Displays comprehensive document metadata, summary, relevance information,
 * and provides actions to approve/reject documents or open them in a new tab.
 * 
 * @example
 * ```tsx
 * <DocumentPreviewModal
 *   isOpen={showDocumentPreview}
 *   onClose={() => setShowDocumentPreview(false)}
 *   document={previewDocument}
 *   onStatusChange={handleStatusChange}
 * />
 * ```
 */
const DocumentPreviewModalComponent: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  onStatusChange
}) => {
  // Memoize formatDate to prevent function recreation on every render
  // Must be called before early return to follow Rules of Hooks
  const formatDate = useCallback((dateString: string | undefined): string => {
    if (!dateString) return t('common.noDateAvailable');
    const date = new Date(dateString);
    return isNaN(date.getTime())
      ? t('common.unknownDate')
      : date.toLocaleDateString('nl-NL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
  }, []);

  // Memoize document field extractions to prevent recalculation on every render
  // Must be called before early return to follow Rules of Hooks
  const docId = useMemo((): string => {
    const id = document?._id;
    return typeof id === 'string' ? id : (id ? String(id) : '');
  }, [document?._id]);
  const docTitle = useMemo(() => document ? getCanonicalDocumentTitle(document) : '', [document]);
  const docUrl = useMemo(() => document ? getCanonicalDocumentUrl(document) || '' : '', [document]);
  const docAcceptance = useMemo(() => document ? getCanonicalDocumentAcceptance(document) : undefined, [document]);
  const docType = useMemo(() => document ? getCanonicalDocumentType(document) || t('common.unknown') : t('common.unknown'), [document]);
  
  // Extract additional fields
  const sourceMetadata = useMemo(() => (document?.sourceMetadata || {}) as Record<string, unknown>, [document?.sourceMetadata]);
  const enrichmentMetadata = useMemo(() => (document?.enrichmentMetadata || {}) as Record<string, unknown>, [document?.enrichmentMetadata]);
  
  const websiteTitel = useMemo(() => {
    if (!document) return '';
    return ((sourceMetadata.legacyWebsiteTitel as string | undefined) || document.publisherAuthority || '') as string;
  }, [sourceMetadata, document?.publisherAuthority]);
  const websiteUrl = useMemo(() => 
    document ? ((sourceMetadata.legacyWebsiteUrl as string) || docUrl) : '',
    [sourceMetadata.legacyWebsiteUrl, docUrl]
  );

  // Extract summary from fullText (first 500 chars) or use summary from metadata if available
  const samenvatting = useMemo(() => {
    if (!document) return t('documentPreview.noSummaryAvailable');

    let fullText = '';
    if ('fullText' in document && (document as CanonicalDocument).fullText) {
      fullText = (document as CanonicalDocument).fullText;
    } else if ('fullTextPreview' in document && (document as LightweightDocument).fullTextPreview) {
      fullText = (document as LightweightDocument).fullTextPreview || '';
    }

    return fullText.length > 0
      ? fullText.substring(0, 500) + (fullText.length > 500 ? '...' : '')
      : t('documentPreview.noSummaryAvailable');
  }, [document]);

  const relevanceText = useMemo(() => 
    document ? ((enrichmentMetadata.relevanceExplanation as string) || (sourceMetadata.legacyRelevance as string) || '') : '',
    [enrichmentMetadata.relevanceExplanation, sourceMetadata.legacyRelevance]
  );

  const publicatiedatum = useMemo(() => {
    const doc = document as CanonicalDocument | LightweightDocument | undefined;
    if (!doc?.dates) return undefined;
    const dates = doc.dates as { publishedAt?: Date | string } | undefined;
    if (!dates?.publishedAt) return undefined;
    const publishedAt = dates.publishedAt;
    return typeof publishedAt === 'string'
      ? publishedAt
      : (publishedAt instanceof Date ? publishedAt.toISOString().split('T')[0] : new Date(publishedAt).toISOString().split('T')[0]);
  }, [document]);

  const subjects = useMemo(() => (enrichmentMetadata.subjects as string[]) || [], [enrichmentMetadata.subjects]);
  const themes = useMemo(() => (enrichmentMetadata.themes as string[]) || [], [enrichmentMetadata.themes]);

  if (!document) return null;

  const handleApprove = () => {
    const newStatus = docAcceptance === true ? 'pending' : 'approved';
    onStatusChange(docId, newStatus);
    if (newStatus === 'approved') {
      toast.success(t('documentPreview.documentApproved'), t('documentPreview.documentApprovedDesc'));
    }
  };

  const handleReject = () => {
    const newStatus = docAcceptance === false ? 'pending' : 'rejected';
    onStatusChange(docId, newStatus);
    if (newStatus === 'rejected') {
      toast.info(t('documentPreview.documentRejected'), t('documentPreview.documentRejectedDesc'));
    }
  };

  const handleOpenDocument = () => {
    if (docUrl) {
      window.open(docUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast.error(t('documentPreview.cannotOpenDocument'), t('documentPreview.noUrlAvailable'));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto ">
        <DialogHeader>
          <DialogTitle className="font-serif font-semibold text-foreground">
            {docTitle}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('documentPreviewModal.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4 text-foreground">
          {/* Document Metadata */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border-2 border-primary bg-primary/5">
            <div>
              <p className="text-xs font-medium mb-1 flex items-center gap-1 text-muted-foreground">
                <Globe className="w-3 h-3" />
                {t('documentPreviewModal.website')}
              </p>
              <p className="text-sm font-medium">{websiteTitel || websiteUrl}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1 flex items-center gap-1 text-muted-foreground">
                <FileText className="w-3 h-3" />
                {t('documentPreviewModal.type')}
              </p>
              <p className="text-sm font-medium">{docType}</p>
            </div>
            {publicatiedatum && (
              <div>
                <p className="text-xs font-medium mb-1 flex items-center gap-1 text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {t('documentPreviewModal.publicationDate')}
                </p>
                <p className="text-sm font-medium">{formatDate(publicatiedatum)}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium mb-1 text-muted-foreground">{t('documentPreviewModal.status')}</p>
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${docAcceptance === true
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : docAcceptance === false
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-muted text-foreground'
                }`}>
                {docAcceptance === true
                  ? t('documentPreview.approved')
                  : docAcceptance === false
                    ? t('documentPreview.rejected')
                    : t('documentPreview.toReview')}
              </span>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-medium mb-1 flex items-center gap-1 text-muted-foreground">
                <ExternalLink className="w-3 h-3" />
                {t('documentPreviewModal.url')}
              </p>
              {docUrl ? (
                <a
                  href={docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm flex items-center gap-1 hover:opacity-70 transition-opacity break-all text-primary"
                >
                  {docUrl}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">{t('documentPreviewModal.noUrlAvailable')}</span>
              )}
            </div>
          </div>

          {/* Document Summary */}
          <div className="p-4 rounded-lg border border-border bg-background">
            <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
              <FileText className="w-4 h-4 text-primary" />
              {t('documentPreviewModal.summary')}
            </h4>
            <p className="text-sm leading-relaxed text-foreground">
              {samenvatting}
            </p>
          </div>

          {/* Relevance */}
          {relevanceText && (
            <div className="p-4 rounded-lg border border-primary bg-primary/5">
              <h4 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                {t('documentPreviewModal.relevance')}
              </h4>
              <p className="text-sm leading-relaxed text-foreground">
                {relevanceText}
              </p>
            </div>
          )}

          {/* Subjects and Themes */}
          {(subjects.length > 0 || themes.length > 0) && (
            <div className="space-y-2">
              {subjects.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium mb-2 text-muted-foreground">{t('documentPreviewModal.subjects')}</h4>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((subject, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {themes.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium mb-2 text-muted-foreground">{t('documentPreview.themes')}</h4>
                  <div className="flex flex-wrap gap-2">
                    {themes.map((theme, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-border">
            <Button
              onClick={handleOpenDocument}
              disabled={!docUrl}
              className="flex items-center gap-2 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <ExternalLink className="w-4 h-4" />
              {t('documentPreviewModal.openDocument')}
            </Button>
            <Button
              onClick={handleApprove}
              variant="outline"
              className={`flex items-center gap-2 ${docAcceptance === true
                  ? 'bg-background text-foreground border-muted'
                  : 'border-primary text-primary hover:bg-primary/10'
                }`}
            >
              <Check className="w-4 h-4" />
              {docAcceptance === true ? t('documentPreview.approved') : t('documentPreview.approve')}
            </Button>
            <Button
              onClick={handleReject}
              variant="outline"
              className={`flex items-center gap-2 ${docAcceptance === false
                  ? 'bg-background text-foreground border-muted'
                  : 'border-destructive text-destructive hover:bg-destructive/10'
                }`}
            >
              <X className="w-4 h-4" />
              {docAcceptance === false ? t('documentPreview.rejected') : t('documentPreview.reject')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Memoize DocumentPreviewModal to prevent unnecessary re-renders
// Only re-render when props actually change
export const DocumentPreviewModal = memo(DocumentPreviewModalComponent, (prevProps, nextProps) => {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.onClose === nextProps.onClose &&
    prevProps.onStatusChange === nextProps.onStatusChange &&
    // Deep compare document by _id (most common change)
    prevProps.document?._id === nextProps.document?._id &&
    // Also check if document object reference changed (for other updates)
    prevProps.document === nextProps.document
  );
});
