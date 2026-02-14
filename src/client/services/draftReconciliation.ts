/**
 * Draft Reconciliation Service
 * 
 * Compares client-side draft state with server-side session state
 * to detect and resolve divergences.
 */

import type { BeleidsscanDraft } from '../hooks/useDraftPersistence.js';

/**
 * Map wizard step ID to step number
 */
const STEP_ID_TO_NUMBER_MAP: Record<string, number> = {
  'query-configuration': 1,
  'website-selection': 2,
  'document-review': 3,
};

/**
 * Convert wizard step ID to step number
 */
function stepIdToStepNumber(stepId: string | undefined): number {
  if (!stepId) return 1;
  return STEP_ID_TO_NUMBER_MAP[stepId] || 1;
}

/**
 * Server-side session state (from WizardSession)
 */
export interface ServerSessionState {
  sessionId: string;
  currentStepId: string;
  context: Record<string, unknown>;
  updatedAt: string;
  queryId?: string | null;
}

/**
 * Reconciliation result
 */
export interface ReconciliationResult {
  hasDivergence: boolean;
  divergences: Divergence[];
  clientNewer: boolean;
  serverNewer: boolean;
}

/**
 * Divergence between client and server
 */
export interface Divergence {
  field: string;
  clientValue: unknown;
  serverValue: unknown;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Compare client draft with server session state
 * 
 * @param clientDraft - Client-side draft from localStorage
 * @param serverState - Server-side session state
 * @returns Reconciliation result with detected divergences
 */
export function reconcileDraftState(
  clientDraft: BeleidsscanDraft | null,
  serverState: ServerSessionState | null
): ReconciliationResult {
  // If no server state, no divergence
  if (!serverState) {
    return {
      hasDivergence: false,
      divergences: [],
      clientNewer: false,
      serverNewer: false,
    };
  }

  // If no client draft, server is newer
  if (!clientDraft) {
    return {
      hasDivergence: false,
      divergences: [],
      clientNewer: false,
      serverNewer: true,
    };
  }

  const divergences: Divergence[] = [];
  
  // Compare timestamps to determine which is newer
  const clientTimestamp = clientDraft.timestamp ? new Date(clientDraft.timestamp).getTime() : 0;
  const serverTimestamp = serverState.updatedAt ? new Date(serverState.updatedAt).getTime() : 0;
  const clientNewer = clientTimestamp > serverTimestamp;
  const serverNewer = serverTimestamp > clientTimestamp;

  // Compare key fields
  const clientStep = clientDraft.step || 1;
  const serverStep = stepIdToStepNumber(serverState.currentStepId);
  
  if (clientStep !== serverStep) {
    divergences.push({
      field: 'step',
      clientValue: clientStep,
      serverValue: serverStep,
      severity: 'high',
    });
  }

  // Compare queryId (normalize null/undefined to null for comparison)
  const clientQueryId = clientDraft.queryId || null;
  const serverQueryId = serverState.queryId || null;
  
  if (clientQueryId !== serverQueryId) {
    divergences.push({
      field: 'queryId',
      clientValue: clientQueryId,
      serverValue: serverQueryId,
      severity: 'high',
    });
  }

  // Compare onderwerp (only if both are defined and different)
  const clientOnderwerp = clientDraft.onderwerp || undefined;
  const serverOnderwerp = (serverState.context.onderwerp as string | undefined) || undefined;
  
  // Only report divergence if both values exist and are different
  // If one is undefined, it's not necessarily a divergence (might not be saved to context)
  if (clientOnderwerp !== undefined && serverOnderwerp !== undefined && clientOnderwerp !== serverOnderwerp) {
    divergences.push({
      field: 'onderwerp',
      clientValue: clientOnderwerp,
      serverValue: serverOnderwerp,
      severity: 'medium',
    });
  }

  // Compare selectedWebsites
  const clientWebsites = clientDraft.selectedWebsites || [];
  const serverWebsites = (serverState.context.selectedWebsites as string[] | undefined) || [];
  
  if (clientWebsites.length !== serverWebsites.length ||
      !clientWebsites.every(id => serverWebsites.includes(id))) {
    divergences.push({
      field: 'selectedWebsites',
      clientValue: clientWebsites.length,
      serverValue: serverWebsites.length,
      severity: 'medium',
    });
  }

  return {
    hasDivergence: divergences.length > 0,
    divergences,
    clientNewer,
    serverNewer,
  };
}

/**
 * Merge client and server states
 * 
 * @param clientDraft - Client-side draft
 * @param serverState - Server-side session state
 * @param preferServer - If true, prefer server values; otherwise prefer client
 * @returns Merged draft state
 */
export function mergeDraftStates(
  clientDraft: BeleidsscanDraft | null,
  serverState: ServerSessionState | null,
  preferServer: boolean
): BeleidsscanDraft | null {
  if (preferServer && serverState) {
    // Prefer server state
    return {
      onderwerp: (serverState.context.onderwerp as string | undefined) || undefined,
      queryId: serverState.queryId || null,
      selectedWebsites: (serverState.context.selectedWebsites as string[] | undefined) || [],
      step: stepIdToStepNumber(serverState.currentStepId),
      timestamp: serverState.updatedAt,
      // Preserve other client-side only fields
      ...(clientDraft ? {
        overheidslaag: clientDraft.overheidslaag,
        selectedEntity: clientDraft.selectedEntity,
        websiteSearchQuery: clientDraft.websiteSearchQuery,
        websiteSortBy: clientDraft.websiteSortBy,
        websiteFilterType: clientDraft.websiteFilterType,
        documents: clientDraft.documents,
        documentFilter: clientDraft.documentFilter,
        documentSortBy: clientDraft.documentSortBy,
        documentSortDirection: clientDraft.documentSortDirection,
        documentSearchQuery: clientDraft.documentSearchQuery,
        documentTypeFilter: clientDraft.documentTypeFilter,
        documentDateFilter: clientDraft.documentDateFilter,
        documentWebsiteFilter: clientDraft.documentWebsiteFilter,
        selectedDocuments: clientDraft.selectedDocuments,
        scrollPositions: clientDraft.scrollPositions,
      } : {}),
    };
  }

  // Prefer client state (default)
  if (clientDraft) {
    return {
      ...clientDraft,
      // Update timestamp if server is newer
      timestamp: serverState?.updatedAt || clientDraft.timestamp,
    };
  }

  // No client draft, use server state
  if (serverState) {
    return {
      onderwerp: (serverState.context.onderwerp as string | undefined) || undefined,
      queryId: serverState.queryId || null,
      selectedWebsites: (serverState.context.selectedWebsites as string[] | undefined) || [],
      step: stepIdToStepNumber(serverState.currentStepId),
      timestamp: serverState.updatedAt,
    };
  }

  return null;
}

