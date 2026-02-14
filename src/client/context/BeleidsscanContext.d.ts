/**
 * BeleidsscanContext - Shared state for the Beleidsscan wizard
 *
 * This context provides:
 * - Reducer-based UI state (step, modals)
 * - Query configuration state (overheidslaag, entity, onderwerp)
 * - Documents state (scraped documents, selections)
 * - Website suggestions state
 * - Draft persistence integration
 *
 * By centralizing state here, we reduce prop drilling and make the wizard
 * more maintainable and testable.
 */
import React, { type Dispatch, type ReactNode } from 'react';
import { beleidsscanActions, type BeleidsscanState, type BeleidsscanAction } from '../reducers/beleidsscanReducer';
import type { LightweightDocument } from '../utils/documentStateOptimization';
/**
 * Types for overheidslaag selection
 */
export type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
/**
 * Validation errors for Step 1
 */
export interface ValidationErrors {
    onderwerp?: string;
    overheidslaag?: string;
    selectedEntity?: string;
}
/**
 * Query configuration state
 */
interface QueryConfigState {
    overheidslaag: WebsiteType | null;
    selectedEntity: string;
    onderwerp: string;
    searchQuery: string;
    topicSearchQuery: string;
    queryId: string | null;
}
/**
 * Website selection state
 */
interface WebsiteSelectionState {
    selectedWebsites: string[];
    websiteSearchQuery: string;
    websiteSortBy: 'relevance' | 'name' | 'type';
    websiteFilterType: string | null;
}
/**
 * Document review state
 *
 * ✅ **MIGRATED** - Now uses CanonicalDocument instead of BronDocument.
 * Components can transform to Bron format for display compatibility.
 */
interface DocumentReviewState {
    documents: LightweightDocument[];
    selectedDocuments: string[];
    isLoadingDocuments: boolean;
    documentsError: string | null;
}
/**
 * Full context value type
 */
export interface BeleidsscanContextValue {
    state: BeleidsscanState;
    dispatch: Dispatch<BeleidsscanAction>;
    actions: typeof beleidsscanActions;
    queryConfig: QueryConfigState;
    setOverheidslaag: (laag: WebsiteType | null) => void;
    setSelectedEntity: (entity: string) => void;
    setOnderwerp: (onderwerp: string) => void;
    setSearchQuery: (query: string) => void;
    setTopicSearchQuery: (query: string) => void;
    setQueryId: (id: string | null) => void;
    websiteSelection: WebsiteSelectionState;
    setSelectedWebsites: (websites: string[]) => void;
    toggleWebsiteSelection: (websiteId: string) => void;
    setWebsiteSearchQuery: (query: string) => void;
    setWebsiteSortBy: (sortBy: 'relevance' | 'name' | 'type') => void;
    setWebsiteFilterType: (type: string | null) => void;
    documentReview: DocumentReviewState;
    setDocuments: React.Dispatch<React.SetStateAction<LightweightDocument[]>>;
    setSelectedDocuments: (docs: string[]) => void;
    toggleDocumentSelection: (docId: string) => void;
    setIsLoadingDocuments: (loading: boolean) => void;
    setDocumentsError: (error: string | null) => void;
    validationErrors: ValidationErrors;
    setValidationErrors: (errors: ValidationErrors | ((prev: ValidationErrors) => ValidationErrors)) => void;
    isEditingCompletedSet: boolean;
    originalQueryId: string | null;
    setIsEditingCompletedSet: (editing: boolean) => void;
    setOriginalQueryId: (id: string | null) => void;
    canProceedStep1: boolean;
    canProceedStep2: boolean;
}
declare const BeleidsscanContext: React.Context<BeleidsscanContextValue | null>;
interface BeleidsscanProviderProps {
    children: ReactNode;
    /** Initial values for testing or restoration from draft */
    initialValues?: {
        overheidslaag?: WebsiteType | null;
        selectedEntity?: string;
        onderwerp?: string;
        queryId?: string | null;
        step?: number;
    };
}
/**
 * Provider component for BeleidsscanContext
 */
export declare function BeleidsscanProvider({ children, initialValues }: BeleidsscanProviderProps): import("react/jsx-runtime").JSX.Element;
/**
 * Hook to access Beleidsscan context
 *
 * @throws Error if used outside of BeleidsscanProvider
 *
 * @example
 * ```tsx
 * function StepComponent() {
 *   const { state, dispatch, queryConfig } = useBeleidsscan();
 *
 *   return (
 *     <div>
 *       <p>Current step: {state.step}</p>
 *       <p>Query: {queryConfig.onderwerp}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export declare function useBeleidsscan(): BeleidsscanContextValue;
/**
 * Selector hook for optimized re-renders
 * Only re-renders when the selected value changes
 *
 * @example
 * ```tsx
 * // Only re-renders when step changes
 * const step = useBeleidsscanSelector(ctx => ctx.state.step);
 *
 * // Only re-renders when queryId changes
 * const queryId = useBeleidsscanSelector(ctx => ctx.queryConfig.queryId);
 * ```
 */
export declare function useBeleidsscanSelector<T>(selector: (ctx: BeleidsscanContextValue) => T): T;
export default BeleidsscanContext;
