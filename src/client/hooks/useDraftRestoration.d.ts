/**
 * Hook for managing draft restoration logic
 * Extracted from Beleidsscan component to reduce component size
 *
 * ✅ **MIGRATED** - Now handles both CanonicalDocument and BronDocument when restoring drafts.
 * Drafts may contain either format, so we handle both for backward compatibility.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import type { LightweightDocument } from '../utils/documentStateOptimization';
import type { BeleidsscanDraft } from './useDraftPersistence';
import type { WebsiteType } from '../components/Beleidsscan/types';
import type { DocumentFilter, DocumentSortBy, DocumentDateFilter } from './useDocumentFiltering';
interface UseDraftRestorationProps {
    setOverheidslaag: (value: WebsiteType | null) => void;
    setSelectedEntity: (value: string) => void;
    setOnderwerp: (value: string) => void;
    setTopicSearchQuery: (value: string) => void;
    setQueryId: (value: string | null) => void;
    restoreWebsiteGenerationProgress: (queryId: string) => void;
    setSelectedWebsites: (value: string[]) => void;
    setWebsiteSearchQuery: (value: string) => void;
    setWebsiteSortBy: (value: 'relevance' | 'name' | 'type') => void;
    setWebsiteFilterType: (value: string | null) => void;
    setDocuments: (updater: (prev: LightweightDocument[]) => LightweightDocument[]) => void;
    setDocumentFilter: (filter: DocumentFilter) => void;
    setDocumentSortBy: (sortBy: DocumentSortBy) => void;
    setDocumentSortDirection: (value: 'asc' | 'desc') => void;
    setDocumentSearchQuery: (value: string) => void;
    setDocumentTypeFilter: (value: string | null) => void;
    setDocumentDateFilter: (filter: DocumentDateFilter) => void;
    setDocumentWebsiteFilter: (value: string | null) => void;
    setSelectedDocuments: ((docs: string[]) => void) | ((updater: (prev: string[]) => string[]) => void);
    setScrollPositions: ((positions: Record<number, number>) => void) | ((updater: (prev: Record<number, number>) => Record<number, number>) => void);
    dispatch: ((action: {
        type: string;
        payload?: number;
    }) => void) | ((action: unknown) => void) | ((action: any) => void);
    setStep: (step: number) => void;
}
/**
 * Hook for managing draft restoration logic
 * Provides handler to restore draft state to component
 */
export declare function useDraftRestoration({ setOverheidslaag, setSelectedEntity, setOnderwerp, setTopicSearchQuery, setQueryId, restoreWebsiteGenerationProgress, setSelectedWebsites, setWebsiteSearchQuery, setWebsiteSortBy, setWebsiteFilterType, setDocuments, setDocumentFilter, setDocumentSortBy, setDocumentSortDirection, setDocumentSearchQuery, setDocumentTypeFilter, setDocumentDateFilter, setDocumentWebsiteFilter, setSelectedDocuments, setScrollPositions, dispatch: _dispatch, setStep, }: UseDraftRestorationProps): {
    handleDraftRestore: (draft: BeleidsscanDraft) => void;
};
export {};
