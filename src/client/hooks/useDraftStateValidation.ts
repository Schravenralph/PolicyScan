/**
 * Hook for validating if draft state has meaningful content
 * Extracted from Beleidsscan component to reduce component size
 */

import { useMemo } from 'react';
import type { BeleidsscanDraft } from './useDraftPersistence.js';

interface UseDraftStateValidationProps {
  draftState: BeleidsscanDraft;
}

/**
 * Hook for validating if draft state has meaningful content
 * Determines if the draft contains enough information to be worth saving
 */
export function useDraftStateValidation({
  draftState,
}: UseDraftStateValidationProps) {
  const hasMeaningfulState = useMemo(() => {
    const hasStep1State = !!(draftState.overheidslaag || draftState.onderwerp || draftState.selectedEntity);
    const hasStep2State =
      (draftState.selectedWebsites?.length ?? 0) > 0 ||
      !!draftState.websiteSearchQuery ||
      !!draftState.websiteFilterType ||
      draftState.websiteSortBy !== 'relevance';
    const hasStep3State =
      (draftState.documents?.length ?? 0) > 0 ||
      !!draftState.documentSearchQuery ||
      draftState.documentFilter !== 'all' ||
      !!draftState.documentTypeFilter ||
      draftState.documentDateFilter !== 'all' ||
      !!draftState.documentWebsiteFilter ||
      draftState.documentSortBy !== 'relevance' ||
      draftState.documentSortDirection !== 'desc' ||
      (draftState.selectedDocuments?.length ?? 0) > 0;
    return hasStep1State || hasStep2State || hasStep3State;
  }, [draftState]);

  return {
    hasMeaningfulState,
  };
}

