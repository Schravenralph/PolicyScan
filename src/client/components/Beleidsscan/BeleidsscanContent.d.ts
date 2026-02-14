/**
 * BeleidsscanContent Component
 *
 * Handles the JSX rendering for the Beleidsscan wizard.
 * Extracted from Beleidsscan.tsx to reduce component size.
 *
 * Performance optimizations:
 * - Lazy loading of step components to reduce initial bundle size
 * - Pre-loading of next step components in background
 * - Error boundaries for all lazy-loaded steps (graceful error handling)
 * - Suspense boundaries with StepLoader fallback for smooth transitions
 */
import type { BronWebsite, QueryData, WorkflowOutput, CanonicalDocument } from '../../services/api';
import type { BronDocument } from '../../utils/transformations';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
import type { BeleidsscanDraft, DraftSummary } from '../../hooks/useDraftPersistence';
import type { ReconciliationResult } from '../../services/draftReconciliation';
import type { FilterPreset } from '../../hooks/useFilterPresets';
import type { OverheidslaagConfig } from './constants';
import type { DocumentCounts, WebsiteInfo } from './utils';
import type { DocumentFilter, DocumentSortBy, DocumentDateFilter } from '../../hooks/useDocumentFiltering';
type Document = CanonicalDocument | LightweightDocument | BronDocument;
interface BeleidsscanContentProps {
    currentStep: number;
    queryId: string | null | undefined;
    isEditingCompletedSet: boolean;
    originalQueryId: string | null | undefined;
    hasDraft: boolean;
    lastDraftSavedAt: string | null;
    lastDraftSummary: DraftSummary | null;
    showReconciliationDialog: boolean;
    reconciliationResult: ReconciliationResult | null;
    pendingDraft: BeleidsscanDraft | null;
    overheidslagen: OverheidslaagConfig[];
    gemeenten: string[];
    waterschappen: string[];
    provincies: string[];
    rijksorganisaties: string[];
    isLoadingJurisdictions: boolean;
    suggestedWebsites: BronWebsite[];
    isScrapingWebsites: boolean;
    scrapingProgress: number;
    scrapingStatus: string;
    scrapingDocumentsFound: number;
    scrapingEstimatedTime: number | null;
    filteredDocuments: Document[];
    documentFilter: DocumentFilter;
    documentSortBy: DocumentSortBy;
    documentSortDirection: 'asc' | 'desc';
    documentSearchQuery: string;
    debouncedDocumentSearchQuery: string;
    documentTypeFilter: string | null;
    documentDateFilter: DocumentDateFilter;
    documentWebsiteFilter: string | null;
    uniqueDocumentTypes: string[];
    uniqueDocumentWebsites: WebsiteInfo[];
    documentCounts: DocumentCounts;
    filterPresets: FilterPreset[];
    isLoadingWebsites: boolean;
    websiteGenerationProgress: number;
    websiteGenerationStatus: string;
    websiteGenerationEstimatedTime: number | undefined;
    websiteSuggestionsError: Error | null;
    onBack: () => void;
    setShowReconciliationDialog: (show: boolean) => void;
    handleGenerateWebsites: () => Promise<void>;
    handleSelectAllWebsites: () => void;
    handleScrapeWebsites: () => Promise<void>;
    handleStepNavigation: (step: number) => Promise<void>;
    handleRestoreDraft: () => void;
    handleDiscardDraft: () => void;
    handleStartFresh?: () => void;
    handleFinalizeDraft: () => void;
    handleUpdateCompletedSet: () => void;
    handleDuplicateCompletedSet: () => void;
    handleDiscardLoadedSet: () => void;
    handleSelectAllDocuments: () => void;
    handleStatusChange: (documentId: string, status: 'approved' | 'rejected' | 'pending') => Promise<void>;
    handleBulkApprove: () => Promise<void>;
    handleBulkReject: () => Promise<void>;
    handleExportDocuments: (format: 'csv' | 'json' | 'markdown' | 'xlsx', scope: 'all' | 'filtered' | 'selected') => Promise<void>;
    handlePreviewDocument: (document: CanonicalDocument | LightweightDocument) => void;
    handleOpenWorkflowImport: () => void;
    handleUseClientDraft: () => void;
    handleUseServerState: () => void;
    handleMergeDrafts: () => void;
    handleIgnoreConflict?: () => Promise<void>;
    handleLoadCompletedSet: (query: QueryData) => Promise<void>;
    clearWebsiteSuggestionsError: () => void;
    cancelWebsiteGeneration: () => void;
    saveDraftToStorage: () => void;
    loadDraftFromStorage: () => BeleidsscanDraft | null;
    restoreDraft: () => void;
    saveFilterPreset: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
    deleteFilterPreset: (id: string) => void;
    setDocumentFilter: (filter: DocumentFilter) => void;
    setDocumentSortBy: (sortBy: DocumentSortBy) => void;
    setDocumentSortDirection: (direction: 'asc' | 'desc') => void;
    setDocumentSearchQuery: (query: string) => void;
    setDocumentTypeFilter: (filter: string | null) => void;
    setDocumentDateFilter: (filter: DocumentDateFilter) => void;
    setDocumentWebsiteFilter: (filter: string | null) => void;
    setShowPreviousSets: (show: boolean) => void;
    getCharacterCounterColor: () => string;
    formatDraftTimestamp: (timestamp?: string | null) => string | null;
    availableWorkflowOutputs: Array<{
        name: string;
        createdAt: string;
    }>;
    selectedWorkflowOutput: string | null;
    workflowOutput: WorkflowOutput | null;
    isLoadingWorkflowOutputs: boolean;
    isImportingWorkflow: boolean;
    onSelectWorkflowOutput: (outputId: string) => Promise<void>;
    onImportWorkflowResults: () => Promise<void>;
    onLoadWorkflowOutputs: () => Promise<void>;
    onCloseWorkflowImport: () => void;
    showDraftRestorePrompt: boolean;
    setShowDraftRestorePrompt: (show: boolean) => void;
    apiKeysError: {
        message: string;
        missingKeys?: {
            openai?: boolean;
            google?: boolean;
        };
        canUseMock?: boolean;
    } | null;
    onUseMockSuggestions: () => void;
    documentsLoadAttemptedRef: React.MutableRefObject<Map<string, number>>;
    wizardSession: any;
}
export declare function BeleidsscanContent({ currentStep, queryId, isEditingCompletedSet, originalQueryId, hasDraft, lastDraftSavedAt, lastDraftSummary, showReconciliationDialog, reconciliationResult, pendingDraft, overheidslagen, gemeenten, waterschappen, provincies, rijksorganisaties, isLoadingJurisdictions, suggestedWebsites, isScrapingWebsites, scrapingProgress, scrapingStatus, scrapingDocumentsFound, scrapingEstimatedTime, filteredDocuments, documentFilter, documentSortBy, documentSortDirection, documentSearchQuery, debouncedDocumentSearchQuery, documentTypeFilter, documentDateFilter, documentWebsiteFilter, uniqueDocumentTypes, uniqueDocumentWebsites, documentCounts, filterPresets, isLoadingWebsites, websiteGenerationProgress, websiteGenerationStatus, websiteGenerationEstimatedTime, websiteSuggestionsError, onBack, setShowReconciliationDialog, handleGenerateWebsites, handleSelectAllWebsites, handleScrapeWebsites, handleStepNavigation, handleRestoreDraft, handleDiscardDraft, handleStartFresh, handleFinalizeDraft, handleUpdateCompletedSet, handleDuplicateCompletedSet, handleDiscardLoadedSet, handleSelectAllDocuments, handleStatusChange, handleBulkApprove, handleBulkReject, handleExportDocuments, handlePreviewDocument, handleOpenWorkflowImport, handleUseClientDraft, handleUseServerState, handleMergeDrafts, handleIgnoreConflict, handleLoadCompletedSet, clearWebsiteSuggestionsError, cancelWebsiteGeneration, saveDraftToStorage, loadDraftFromStorage, restoreDraft, saveFilterPreset, deleteFilterPreset, setDocumentFilter, setDocumentSortBy, setDocumentSortDirection, setDocumentSearchQuery, setDocumentTypeFilter, setDocumentDateFilter, setDocumentWebsiteFilter, setShowPreviousSets, getCharacterCounterColor, formatDraftTimestamp, availableWorkflowOutputs, selectedWorkflowOutput, workflowOutput, isLoadingWorkflowOutputs, isImportingWorkflow, onSelectWorkflowOutput, onImportWorkflowResults, onLoadWorkflowOutputs, onCloseWorkflowImport, showDraftRestorePrompt, setShowDraftRestorePrompt, apiKeysError, onUseMockSuggestions, documentsLoadAttemptedRef, wizardSession, }: BeleidsscanContentProps): import("react/jsx-runtime").JSX.Element;
export {};
