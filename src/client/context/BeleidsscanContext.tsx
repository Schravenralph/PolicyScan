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

import React, { createContext, useContext, useReducer, useState, useMemo, useCallback, type Dispatch, type ReactNode } from 'react';
import {
  beleidsscanReducer,
  initialState,
  beleidsscanActions,
  type BeleidsscanState,
  type BeleidsscanAction,
} from '../reducers/beleidsscanReducer';
/**
 * BeleidsscanContext - Shared state for the Beleidsscan wizard
 * 
 * ✅ **MIGRATED** - Now uses CanonicalDocument for document state.
 * Components can transform to Bron format for display if needed.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import type { CanonicalDocument } from '../services/api';
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
  // Reducer state and dispatch
  state: BeleidsscanState;
  dispatch: Dispatch<BeleidsscanAction>;
  actions: typeof beleidsscanActions;

  // Query configuration
  queryConfig: QueryConfigState;
  setOverheidslaag: (laag: WebsiteType | null) => void;
  setSelectedEntity: (entity: string) => void;
  setOnderwerp: (onderwerp: string) => void;
  setSearchQuery: (query: string) => void;
  setTopicSearchQuery: (query: string) => void;
  setQueryId: (id: string | null) => void;

  // Website selection
  websiteSelection: WebsiteSelectionState;
  setSelectedWebsites: (websites: string[]) => void;
  toggleWebsiteSelection: (websiteId: string) => void;
  setWebsiteSearchQuery: (query: string) => void;
  setWebsiteSortBy: (sortBy: 'relevance' | 'name' | 'type') => void;
  setWebsiteFilterType: (type: string | null) => void;

  // Document review
  documentReview: DocumentReviewState;
  setDocuments: React.Dispatch<React.SetStateAction<LightweightDocument[]>>;
  setSelectedDocuments: (docs: string[]) => void;
  toggleDocumentSelection: (docId: string) => void;
  setIsLoadingDocuments: (loading: boolean) => void;
  setDocumentsError: (error: string | null) => void;

  // Validation
  validationErrors: ValidationErrors;
  setValidationErrors: (errors: ValidationErrors | ((prev: ValidationErrors) => ValidationErrors)) => void;

  // Edit mode
  isEditingCompletedSet: boolean;
  originalQueryId: string | null;
  setIsEditingCompletedSet: (editing: boolean) => void;
  setOriginalQueryId: (id: string | null) => void;

  // Computed values
  canProceedStep1: boolean;
  canProceedStep2: boolean;
}

const BeleidsscanContext = createContext<BeleidsscanContextValue | null>(null);

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
export function BeleidsscanProvider({ children, initialValues }: BeleidsscanProviderProps) {
  // Reducer for UI state (modals, step, etc.)
  const [state, dispatch] = useReducer(beleidsscanReducer, {
    ...initialState,
    step: initialValues?.step ?? 1,
  });

  // Query configuration state
  const [overheidslaag, setOverheidslaag] = useState<WebsiteType | null>(initialValues?.overheidslaag ?? null);
  const [selectedEntity, setSelectedEntity] = useState(initialValues?.selectedEntity ?? '');
  const [onderwerp, setOnderwerp] = useState(initialValues?.onderwerp ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [topicSearchQuery, setTopicSearchQuery] = useState(initialValues?.onderwerp ?? '');
  const [queryId, setQueryId] = useState<string | null>(initialValues?.queryId ?? null);

  // Website selection state
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([]);
  const [websiteSearchQuery, setWebsiteSearchQuery] = useState('');
  const [websiteSortBy, setWebsiteSortBy] = useState<'relevance' | 'name' | 'type'>('relevance');
  const [websiteFilterType, setWebsiteFilterType] = useState<string | null>(null);

  // Document review state
  // ✅ MIGRATED: Now uses CanonicalDocument instead of BronDocument
  const [documents, setDocuments] = useState<LightweightDocument[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Edit mode state
  const [isEditingCompletedSet, setIsEditingCompletedSet] = useState(false);
  const [originalQueryId, setOriginalQueryId] = useState<string | null>(null);

  // Website selection toggle
  const toggleWebsiteSelection = useCallback((websiteId: string) => {
    setSelectedWebsites(prev =>
      prev.includes(websiteId)
        ? prev.filter(id => id !== websiteId)
        : [...prev, websiteId]
    );
  }, []);

  // Document selection toggle
  const toggleDocumentSelection = useCallback((docId: string) => {
    setSelectedDocuments(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  }, []);

  // Computed values
  const canProceedStep1 = useMemo(() => {
    const hasValidOnderwerp = onderwerp.trim().length >= 3;
    const hasValidEntity = overheidslaag === 'kennisinstituut' || selectedEntity.trim().length > 0;
    return overheidslaag !== null && hasValidEntity && hasValidOnderwerp;
  }, [overheidslaag, selectedEntity, onderwerp]);

  const canProceedStep2 = useMemo(() => {
    return selectedWebsites.length > 0;
  }, [selectedWebsites]);

  // Group states for cleaner API
  const queryConfig = useMemo(() => ({
    overheidslaag,
    selectedEntity,
    onderwerp,
    searchQuery,
    topicSearchQuery,
    queryId,
  }), [overheidslaag, selectedEntity, onderwerp, searchQuery, topicSearchQuery, queryId]);

  const websiteSelection = useMemo(() => ({
    selectedWebsites,
    websiteSearchQuery,
    websiteSortBy,
    websiteFilterType,
  }), [selectedWebsites, websiteSearchQuery, websiteSortBy, websiteFilterType]);

  const documentReview = useMemo(() => ({
    documents,
    selectedDocuments,
    isLoadingDocuments,
    documentsError,
  }), [documents, selectedDocuments, isLoadingDocuments, documentsError]);

  // Memoize setter functions to ensure stable references (React useState setters are already stable, but this documents intent)
  // Note: React useState setters are guaranteed to be stable, so they don't need useCallback
  // However, we include them in contextValue for API consistency

  const contextValue = useMemo<BeleidsscanContextValue>(() => ({
    // Reducer
    state,
    dispatch,
    actions: beleidsscanActions,

    // Query configuration
    queryConfig,
    setOverheidslaag,
    setSelectedEntity,
    setOnderwerp,
    setSearchQuery,
    setTopicSearchQuery,
    setQueryId,

    // Website selection
    websiteSelection,
    setSelectedWebsites,
    toggleWebsiteSelection,
    setWebsiteSearchQuery,
    setWebsiteSortBy,
    setWebsiteFilterType,

    // Document review
    documentReview,
    setDocuments,
    setSelectedDocuments,
    toggleDocumentSelection,
    setIsLoadingDocuments,
    setDocumentsError,

    // Validation
    validationErrors,
    setValidationErrors,

    // Edit mode
    isEditingCompletedSet,
    originalQueryId,
    setIsEditingCompletedSet,
    setOriginalQueryId,

    // Computed
    canProceedStep1,
    canProceedStep2,
  }), [
    state,
    dispatch,
    queryConfig,
    websiteSelection,
    toggleWebsiteSelection,
    documentReview,
    toggleDocumentSelection,
    validationErrors,
    isEditingCompletedSet,
    originalQueryId,
    canProceedStep1,
    canProceedStep2,
  ]);

  return (
    <BeleidsscanContext.Provider value={contextValue}>
      {children}
    </BeleidsscanContext.Provider>
  );
}

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
export function useBeleidsscan(): BeleidsscanContextValue {
  const context = useContext(BeleidsscanContext);
  if (!context) {
    throw new Error('useBeleidsscan must be used within a BeleidsscanProvider');
  }
  return context;
}

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
export function useBeleidsscanSelector<T>(selector: (ctx: BeleidsscanContextValue) => T): T {
  const context = useBeleidsscan();
  return selector(context);
}

export default BeleidsscanContext;

