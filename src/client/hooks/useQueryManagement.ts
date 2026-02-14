/**
 * Custom hook for managing query operations in Beleidsscan component
 * Handles loading, updating, duplicating, and finalizing completed query sets
 */

import { useCallback } from 'react';
import { wizardService } from '../services/wizard/WizardService';
import { toast } from '../utils/toast';
import { logError } from '../utils/errorHandler';
import type { QueryData } from '../services/api';
import type { WebsiteType } from '../components/Beleidsscan/types';

export interface UseQueryManagementProps {
  queryId: string | null;
  overheidslaag: WebsiteType | null;
  selectedEntity: string;
  onderwerp: string;
  selectedWebsites: string[];
  documents: Array<{ url?: string }>;
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
  overheidslagen: Array<{ id: WebsiteType; label: string }>;
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
export function useQueryManagement({
  queryId,
  overheidslaag,
  selectedEntity,
  onderwerp,
  selectedWebsites,
  documents,
  originalQueryId,
  isEditingCompletedSet: _isEditingCompletedSet,
  setQueryId,
  setOverheidslaag,
  setSelectedEntity,
  setOnderwerp,
  setTopicSearchQuery,
  setSelectedWebsites,
  setOriginalQueryId,
  setIsEditingCompletedSet,
  setStep,
  discardDraft,
  clearDraft,
  overheidslagen: _overheidslagen,
}: UseQueryManagementProps): UseQueryManagementReturn {
  /**
   * Loads a completed query set for editing
   */
  const handleLoadCompletedSet = useCallback(async (query: QueryData) => {
    if (!query._id) {
      toast.error('Ongeldige query', 'De geselecteerde query heeft geen ID.');
      return;
    }

    try {
      // Clear current draft first
      discardDraft();

      // Set edit mode - we're editing an existing completed query
      setOriginalQueryId(query._id);
      setIsEditingCompletedSet(true);

      // Restore basic query information
      if (query.overheidstype) {
        setOverheidslaag(query.overheidstype as WebsiteType);
      }
      if (query.overheidsinstantie) {
        setSelectedEntity(query.overheidsinstantie);
      }
      if (query.onderwerp) {
        setOnderwerp(query.onderwerp);
        setTopicSearchQuery(query.onderwerp);
      }
      
      // Set query ID to load associated data
      setQueryId(query._id);
      
      // Track that we're editing a completed set
      setOriginalQueryId(query._id);
      setIsEditingCompletedSet(true);

      // Restore website URLs if available
      if (query.websiteUrls && query.websiteUrls.length > 0) {
        setSelectedWebsites(query.websiteUrls);
      }

      // Determine which step to show based on available data
      let targetStep = 1;
      if (query.websiteUrls && query.websiteUrls.length > 0) {
        targetStep = 2;
      }
      if (query.documentUrls && query.documentUrls.length > 0) {
        targetStep = 3;
      }
      setStep(targetStep);

      toast.success('Query set geladen', `Query set "${query.onderwerp}" is geladen in bewerkingsmodus. U kunt wijzigingen aanbrengen en opslaan.`);
    } catch (error) {
      logError(error as Error, 'load-completed-set');
      toast.error('Laden mislukt', 'Het laden van de query set is mislukt. Probeer het opnieuw.');
    }
  }, [discardDraft, setOverheidslaag, setSelectedEntity, setOnderwerp, setTopicSearchQuery, setQueryId, setSelectedWebsites, setOriginalQueryId, setIsEditingCompletedSet, setStep]);

  /**
   * Updates an existing completed query set with the current state
   */
  const handleUpdateCompletedSet = useCallback(async () => {
    if (!originalQueryId || !queryId) {
      toast.error('Geen query gevonden', 'Er is geen query om bij te werken.');
      return;
    }

    try {
      // Collect current query data
      const updateData: Partial<QueryData> = {
        overheidstype: overheidslaag || undefined,
        overheidsinstantie: selectedEntity || undefined,
        onderwerp: onderwerp || '',
        websiteTypes: overheidslaag ? [overheidslaag] : [],
        websiteUrls: selectedWebsites || undefined,
        documentUrls: documents.map(doc => doc.url).filter((url): url is string => Boolean(url)),
      };

      await wizardService.updateQuery(originalQueryId, updateData);
      toast.success('Query bijgewerkt', 'De query set is succesvol bijgewerkt.');
      
      // Clear edit mode
      setOriginalQueryId(null);
      setIsEditingCompletedSet(false);
    } catch (error) {
      logError(error as Error, 'update-completed-set');
      toast.error('Bijwerken mislukt', 'Het bijwerken van de query set is mislukt. Probeer het opnieuw.');
    }
  }, [originalQueryId, queryId, overheidslaag, selectedEntity, onderwerp, selectedWebsites, documents, setOriginalQueryId, setIsEditingCompletedSet]);

  /**
   * Duplicates a completed query set, creating a new query with the current modifications
   */
  const handleDuplicateCompletedSet = useCallback(async () => {
    if (!originalQueryId) {
      toast.error('Geen query gevonden', 'Er is geen query om te dupliceren.');
      return;
    }

    try {
      // Collect current query data (with modifications)
      const duplicateData: Partial<QueryData> = {
        overheidstype: overheidslaag || undefined,
        overheidsinstantie: selectedEntity || undefined,
        onderwerp: onderwerp || '',
        websiteTypes: overheidslaag ? [overheidslaag] : [],
        websiteUrls: selectedWebsites || undefined,
        documentUrls: documents.map(doc => doc.url).filter((url): url is string => Boolean(url)),
      };

      const newQuery = await wizardService.duplicateQuery(originalQueryId, duplicateData);
      
      // Switch to the new query
      if (newQuery._id) {
        setQueryId(newQuery._id);
      }
      
      // Clear edit mode (we're now working with a new query)
      setOriginalQueryId(null);
      setIsEditingCompletedSet(false);
      
      toast.success('Query gedupliceerd', 'Een nieuwe query set is gemaakt op basis van de geselecteerde set.');
    } catch (error) {
      logError(error as Error, 'duplicate-completed-set');
      toast.error('Dupliceren mislukt', 'Het dupliceren van de query set is mislukt. Probeer het opnieuw.');
    }
  }, [originalQueryId, overheidslaag, selectedEntity, onderwerp, selectedWebsites, documents, setQueryId, setOriginalQueryId, setIsEditingCompletedSet]);

  /**
   * Finalizes a draft (converts to completed query set)
   * Navigates to library page with query filter and "documents under review" filter
   */
  const handleFinalizeDraft = useCallback(async () => {
    if (!queryId) {
      toast.error('Geen query gevonden', 'Er is geen actieve query om te finaliseren. Maak eerst een query aan.');
      return;
    }

    try {
      await wizardService.finalizeQuery(queryId);
      toast.success('Query voltooid', 'Uw query is succesvol voltooid en opgeslagen.');
      
      // Clear local draft after successful finalization
      clearDraft();
      
      // Clear edit mode if we were editing
      setOriginalQueryId(null);
      setIsEditingCompletedSet(false);
      
      // Navigate to library page with query filter and "documents under review" filter
      // The library page will load with queryId filter and reviewStatus=pending_review
      const libraryUrl = `/search?queryId=${encodeURIComponent(queryId)}&reviewStatus=pending_review&tab=bibliotheek`;
      window.location.href = libraryUrl;
    } catch (error) {
      logError(error as Error, 'finalize-query');
      toast.error('Finaliseren mislukt', 'Het voltooien van de query is mislukt. Probeer het opnieuw.');
    }
  }, [queryId, clearDraft, setOriginalQueryId, setIsEditingCompletedSet]);

  /**
   * Discards loaded set and starts fresh
   */
  const handleDiscardLoadedSet = useCallback(() => {
    setOriginalQueryId(null);
    setIsEditingCompletedSet(false);
    setQueryId(null);
    discardDraft();
    toast.info('Bewerking geannuleerd', 'U werkt nu aan een nieuwe query.');
  }, [setQueryId, discardDraft, setOriginalQueryId, setIsEditingCompletedSet]);

  return {
    handleLoadCompletedSet,
    handleUpdateCompletedSet,
    handleDuplicateCompletedSet,
    handleFinalizeDraft,
    handleDiscardLoadedSet,
  };
}



