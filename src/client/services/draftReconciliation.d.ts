/**
 * Draft Reconciliation Service
 *
 * Compares client-side draft state with server-side session state
 * to detect and resolve divergences.
 */
import type { BeleidsscanDraft } from '../hooks/useDraftPersistence.js';
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
export declare function reconcileDraftState(clientDraft: BeleidsscanDraft | null, serverState: ServerSessionState | null): ReconciliationResult;
/**
 * Merge client and server states
 *
 * @param clientDraft - Client-side draft
 * @param serverState - Server-side session state
 * @param preferServer - If true, prefer server values; otherwise prefer client
 * @returns Merged draft state
 */
export declare function mergeDraftStates(clientDraft: BeleidsscanDraft | null, serverState: ServerSessionState | null, preferServer: boolean): BeleidsscanDraft | null;
