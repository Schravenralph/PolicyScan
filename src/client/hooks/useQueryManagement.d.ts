/**
 * Custom hook for managing query operations in Beleidsscan component
 * Handles loading, updating, duplicating, and finalizing completed query sets
 */
import type { QueryData } from '../services/api';
import type { WebsiteType } from '../components/Beleidsscan/types';
export interface UseQueryManagementProps {
    queryId: string | null;
    overheidslaag: WebsiteType | null;
    selectedEntity: string;
    onderwerp: string;
    selectedWebsites: string[];
    documents: Array<{
        url?: string;
    }>;
    originalQueryId: string | null;
    isEditingCompletedSet: boolean;
    setQueryId: (id: string | null) => void;
    setOverheidslaag: (type: WebsiteType | null) => void;
    setSelectedEntity: (entity: string) => void;
    setOnderwerp: (onderwerp: string) => void;
    setTopicSearchQuery: (query: string) => void;
    setSelectedWebsites: (websites: string[]) => void;
    setOriginalQueryId: (id: string | null) => void;
    setIsEditingCompletedSet: (editing: boolean) => void;
    setStep: (step: number) => void;
    discardDraft: () => void;
    clearDraft: () => void;
    overheidslagen: Array<{
        id: WebsiteType;
        label: string;
    }>;
}
export interface UseQueryManagementReturn {
    handleLoadCompletedSet: (query: QueryData) => Promise<void>;
    handleUpdateCompletedSet: () => Promise<void>;
    handleDuplicateCompletedSet: () => Promise<void>;
    handleFinalizeDraft: () => Promise<void>;
    handleDiscardLoadedSet: () => void;
}
/**
 * Hook for managing query operations (load, update, duplicate, finalize, discard)
 */
export declare function useQueryManagement({ queryId, overheidslaag, selectedEntity, onderwerp, selectedWebsites, documents, originalQueryId, isEditingCompletedSet: _isEditingCompletedSet, setQueryId, setOverheidslaag, setSelectedEntity, setOnderwerp, setTopicSearchQuery, setSelectedWebsites, setOriginalQueryId, setIsEditingCompletedSet, setStep, discardDraft, clearDraft, overheidslagen: _overheidslagen, }: UseQueryManagementProps): UseQueryManagementReturn;
