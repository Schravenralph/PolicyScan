import { useMemo, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
// BronCard and Bron no longer needed - DocumentCard handles document rendering
import { toast } from '../../utils/toast';
import type { CanonicalDocument } from '../../services/api';
import { logError, getOperationErrorMessage, createErrorWithRetry } from '../../utils/errorHandler';
import { useBeleidsscan } from '../../context/BeleidsscanContext';
import { useCanonicalDocumentsByQuery } from '../../hooks/useCanonicalDocumentWithReactQuery';
import { t } from '../../utils/i18n';
import { FilterControls } from './FilterControls';
import { DocumentStats } from './DocumentStats';
import { DocumentCard } from './DocumentCard';
import { StatusFilterTabs } from './StatusFilterTabs';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { Step3Header } from './Step3Header';
import { Step3SelectAllButton } from './Step3SelectAllButton';
import { Step3EmptyStates } from './Step3EmptyStates';
import { Step3Summary } from './Step3Summary';
import { Step3ActionButtons } from './Step3ActionButtons';
import { getCanonicalDocumentId } from '../../utils/canonicalDocumentUtils';
import type { DocumentCounts } from './utils';
import { type LightweightDocument, createLightweightDocuments } from '../../utils/documentStateOptimization';

/**
 * Document type is now CanonicalDocument or LightweightDocument
 */
type Document = CanonicalDocument | LightweightDocument;

/**
 * Helper to get document ID from CanonicalDocument
 */
function getDocumentId(doc: Document): string | undefined {
  return getCanonicalDocumentId(doc);
}

type FilterPreset = {
  id: string;
  name: string;
  filters: {
    documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
    documentTypeFilter: string | null;
    documentDateFilter: 'all' | 'week' | 'month' | 'year';
    documentWebsiteFilter: string | null;
    documentSearchQuery: string;
  };
};

type WebsiteInfo = { url: string; title: string };

interface Step3DocumentReviewProps {
  // From useDocumentFiltering hook (not in context)
  filteredDocuments: Document[];
  documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
  documentSortBy: 'relevance' | 'date' | 'title' | 'website';
  documentSortDirection: 'asc' | 'desc';
  documentSearchQuery: string;
  documentTypeFilter: string | null;
  documentDateFilter: 'all' | 'week' | 'month' | 'year';
  documentWebsiteFilter: string | null;
  debouncedDocumentSearchQuery: string;
  setDocumentFilter: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;
  setDocumentSortBy: (sortBy: 'relevance' | 'date' | 'title' | 'website') => void;
  setDocumentSortDirection: (direction: 'asc' | 'desc') => void;
  setDocumentSearchQuery: (query: string) => void;
  setDocumentTypeFilter: (filter: string | null) => void;
  setDocumentDateFilter: (filter: 'all' | 'week' | 'month' | 'year') => void;
  setDocumentWebsiteFilter: (filter: string | null) => void;

  // Handlers (defined in parent)
  handleSelectAllDocuments: () => void;
  handleStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => Promise<void>;
  handleBulkApprove: () => Promise<void>;
  handleBulkReject: () => Promise<void>;
  handleExportDocuments: (format: 'csv' | 'json' | 'markdown' | 'xlsx', scope: 'all' | 'filtered' | 'selected') => void;
  handlePreviewDocument: (document: CanonicalDocument | LightweightDocument) => void;
  handleOpenWorkflowImport: () => void;
  setScrapingDocumentsFound: (count: number) => void;
  documentsLoadAttemptedRef: React.MutableRefObject<Map<string, number>>;

  // Filter presets (from useFilterPresets hook)
  filterPresets: FilterPreset[];
  saveFilterPreset: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
  deleteFilterPreset: (presetId: string) => void;

  // Draft persistence (from parent hook, not in context)
  saveDraftToStorage: () => void;

  // Computed values (from parent)
  uniqueDocumentTypes: string[];
  uniqueDocumentWebsites: WebsiteInfo[];
  documentCounts: DocumentCounts;

  // UI state (could be moved to context in future) - removed showStep3Info/showWorkflowInfo, now using centralized help

  // Overheidslagen for summary (static data)
  overheidslagen: Array<{ id: 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut'; label: string }>;

  // Handler for finalizing the draft
  onFinalize?: () => Promise<void> | void;
}

export const Step3DocumentReview: React.FC<Step3DocumentReviewProps> = ({
  filteredDocuments,
  documentFilter,
  documentSortBy,
  documentSortDirection,
  documentSearchQuery,
  documentTypeFilter,
  documentDateFilter,
  documentWebsiteFilter,
  debouncedDocumentSearchQuery,
  setDocumentFilter,
  setDocumentSortBy,
  setDocumentSortDirection,
  setDocumentSearchQuery,
  setDocumentTypeFilter,
  setDocumentDateFilter,
  setDocumentWebsiteFilter,
  handleSelectAllDocuments,
  handleStatusChange,
  handleBulkApprove,
  handleBulkReject,
  handleExportDocuments,
  handlePreviewDocument,
  handleOpenWorkflowImport,
  setScrapingDocumentsFound,
  documentsLoadAttemptedRef,
  filterPresets,
  saveFilterPreset: _saveFilterPreset,
  deleteFilterPreset,
  saveDraftToStorage,
  uniqueDocumentTypes,
  uniqueDocumentWebsites,
  documentCounts,
  overheidslagen,
  onFinalize,
}) => {
  // Get state from context instead of props
  const {
    documentReview,
    setDocuments,
    setSelectedDocuments,
    toggleDocumentSelection,
    setIsLoadingDocuments,
    setDocumentsError,
    queryConfig,
    websiteSelection,
    dispatch,
    actions,
  } = useBeleidsscan();

  const {
    documents,
    selectedDocuments,
    isLoadingDocuments,
    documentsError,
  } = documentReview;

  const { queryId, overheidslaag, selectedEntity, onderwerp } = queryConfig;
  const { selectedWebsites } = websiteSelection;
  // presetName removed - was only used in removed _handleSaveFilterPreset function

  // Use React Query hook for document fetching
  const { data: _documentsData, isLoading: _isLoadingDocumentsQuery, error: _documentsQueryError, refetch: refetchDocuments } = useCanonicalDocumentsByQuery(queryId || null, {
    enabled: false, // Don't auto-fetch - parent component manages loading
    limit: 20000, // High limit to avoid capping at 50 documents
  });

  // Handlers for preset dialog
  const setShowPresetDialog = (show: boolean) => {
    dispatch(actions.setShowPresetDialog(show));
  };

  const setPresetName = (name: string) => {
    dispatch(actions.setPresetName(name));
  };


  // Handler for step navigation
  const setStep = (step: number) => {
    dispatch(actions.setStep(step));
  };
  
  // Memoize handlers to prevent unnecessary re-renders of child components
  const handleClearSelection = useCallback(() => {
    setSelectedDocuments([]);
  }, [setSelectedDocuments]);
  
  const handleClearFilters = useCallback(() => {
    setDocumentSearchQuery('');
    setDocumentTypeFilter(null);
    setDocumentDateFilter('all');
    setDocumentWebsiteFilter(null);
    setDocumentFilter('all');
  }, [setDocumentSearchQuery, setDocumentTypeFilter, setDocumentDateFilter, setDocumentWebsiteFilter, setDocumentFilter]);
  
  // Convert selectedDocuments array to Set for O(1) lookup instead of O(n)
  // This optimization is especially important for large document lists
  const selectedSet = useMemo(() => new Set(selectedDocuments), [selectedDocuments]);
  
  // Handler for retrying document load
  const handleRetryDocumentLoad = async () => {
    if (queryId) {
      documentsLoadAttemptedRef.current.delete(queryId);
      setIsLoadingDocuments(true);
      setDocumentsError(null);
      try {
        const { data: docs } = await refetchDocuments();
        // Type safety: Ensure docs is an array
        // Docs from useCanonicalDocumentsByQuery are CanonicalDocument[]
        if (Array.isArray(docs)) {
          // Convert to lightweight documents to prevent React DevTools crashes (64MB limit)
          const lightweightDocs = createLightweightDocuments(docs);
          setDocuments(lightweightDocs);
          setScrapingDocumentsFound(docs.length);
          documentsLoadAttemptedRef.current.set(queryId, Date.now());
          setDocumentsError(null);
        } else {
          const error = new Error('API returned non-array documents');
          logError(error, 'load-documents');
          const errorInfo = getOperationErrorMessage('load-documents', error);
          setDocuments([]);
          setDocumentsError(errorInfo.message);
          const errorWithRetry = createErrorWithRetry(error, handleRetryDocumentLoad, 'load-documents');
          toast.errorWithRetry(errorWithRetry);
        }
      } catch (error) {
        logError(error as Error, 'load-documents');
        const errorInfo = getOperationErrorMessage('load-documents', error);
        setDocumentsError(errorInfo.message);
        const errorWithRetry = createErrorWithRetry(error, handleRetryDocumentLoad, 'load-documents');
        toast.errorWithRetry(errorWithRetry);
      } finally {
        setIsLoadingDocuments(false);
      }
    }
  };

  // Handler for saving filter preset (currently unused, reserved for future use)
  // Removed unused _handleSaveFilterPreset function

  return (
    <section className="space-y-6" aria-labelledby="step3-title">
      <Step3Header
        isLoadingDocuments={isLoadingDocuments}
        documentsError={documentsError}
        documents={documents}
        selectedDocuments={selectedDocuments}
        onRetryDocumentLoad={handleRetryDocumentLoad}
        onExport={handleExportDocuments}
        onOpenWorkflowImport={handleOpenWorkflowImport}
      />

      {/* Filter and Bulk Actions Bar */}
      {documents.length > 0 && (
        <div className="space-y-4">
          {/* Document Search and Filters */}
          <FilterControls
            documentSearchQuery={documentSearchQuery}
            setDocumentSearchQuery={setDocumentSearchQuery}
            documentSortBy={documentSortBy}
            documentSortDirection={documentSortDirection}
            setDocumentSortBy={setDocumentSortBy}
            setDocumentSortDirection={setDocumentSortDirection}
            documentTypeFilter={documentTypeFilter}
            documentDateFilter={documentDateFilter}
            documentWebsiteFilter={documentWebsiteFilter}
            documentFilter={documentFilter}
            setDocumentTypeFilter={setDocumentTypeFilter}
            setDocumentDateFilter={setDocumentDateFilter}
            setDocumentWebsiteFilter={setDocumentWebsiteFilter}
            setDocumentFilter={setDocumentFilter}
            uniqueDocumentTypes={uniqueDocumentTypes}
            uniqueDocumentWebsites={uniqueDocumentWebsites}
            filterPresets={filterPresets}
            deleteFilterPreset={deleteFilterPreset}
            isLoadingDocuments={isLoadingDocuments}
            setShowPresetDialog={setShowPresetDialog}
            setPresetName={setPresetName}
          />

          {/* Status Filter Tabs */}
          <StatusFilterTabs
            documentFilter={documentFilter}
            setDocumentFilter={setDocumentFilter}
            documentCounts={documentCounts}
            isLoadingDocuments={isLoadingDocuments}
            onSelectionClear={handleClearSelection}
          />

          {/* Bulk Actions Toolbar */}
          <BulkActionsToolbar
            selectedCount={selectedDocuments.length}
            onBulkApprove={handleBulkApprove}
            onBulkReject={handleBulkReject}
            onDeselectAll={() => setSelectedDocuments([])}
          />

          {/* Select All / Deselect All */}
          {filteredDocuments.length > 0 && !isLoadingDocuments && !documentsError && (
            <Step3SelectAllButton
              selectedCount={selectedDocuments.length}
              totalCount={filteredDocuments.length}
              onSelectAll={handleSelectAllDocuments}
              disabled={isLoadingDocuments}
            />
          )}
        </div>
      )}

      {/* Document Count Display */}
      {!isLoadingDocuments && !documentsError && documents.length > 0 && (
        <DocumentStats
          filteredCount={filteredDocuments.length}
          totalCount={documents.length}
          hasActiveFilters={!!(documentSearchQuery || documentTypeFilter || documentDateFilter !== 'all' || documentWebsiteFilter || documentFilter !== 'all')}
          onClearFilters={handleClearFilters}
        />
      )}

      {/* Document List */}
      {isLoadingDocuments ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4" role="status" aria-live="polite">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">{t('step3.documentsLoading')}</p>
        </div>
      ) : documentsError ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-4" role="alert" aria-live="assertive">
          <AlertCircle className="w-8 h-8 text-destructive" aria-hidden="true" />
          <p className="text-destructive">{documentsError}</p>
        </div>
      ) : filteredDocuments.length > 0 ? (
        <div className="mt-4 space-y-4">
          <div role="list" aria-label={t('step3.foundDocuments')} data-testid="document-list" className="space-y-4">
            {filteredDocuments.map((document) => {
              const docId = getDocumentId(document);
              if (!docId) return null; // Skip documents without ID
              
              return (
                <DocumentCard
                  key={docId}
                  document={document}
                  selected={selectedSet.has(docId)}
                  onSelect={toggleDocumentSelection}
                  onPreview={handlePreviewDocument}
                  onStatusChange={handleStatusChange}
                  searchQuery={debouncedDocumentSearchQuery}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <Step3EmptyStates
          hasDocuments={documents.length > 0}
          hasFilteredDocuments={filteredDocuments.length > 0}
          documentFilter={documentFilter}
          onClearFilter={() => setDocumentFilter('all')}
          onGoToStep2={() => setStep(2)}
          onOpenWorkflowImport={handleOpenWorkflowImport}
        />
      )}

      {/* Summary */}
      <Step3Summary
        overheidslagen={overheidslagen}
        overheidslaag={overheidslaag || ''}
        selectedEntity={selectedEntity}
        onderwerp={onderwerp}
        selectedWebsites={selectedWebsites}
        documents={documents}
      />

      {/* Action Buttons */}
      <Step3ActionButtons
        onGoToStep2={() => setStep(2)}
        onSaveDraft={saveDraftToStorage}
        onContinue={onFinalize}
      />
    </section>
  );
};
