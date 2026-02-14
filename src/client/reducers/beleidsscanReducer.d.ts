/**
 * Beleidsscan Reducer
 *
 * ✅ **MIGRATED** - Now uses CanonicalDocument for preview document.
 * Components can transform to Bron format for display if needed.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import type { CanonicalDocument } from '../services/api';
import { type LightweightDocument } from '../utils/documentStateOptimization';
/**
 * State managed by the Beleidsscan reducer
 */
export interface BeleidsscanState {
    step: number;
    showGraphVisualizer: boolean;
    showWorkflowImport: boolean;
    showDocumentPreview: boolean;
    showPresetDialog: boolean;
    showPreviousSets: boolean;
    showStep2Info: boolean;
    showScrapingInfo: boolean;
    showStep1Info: boolean;
    showStep3Info: boolean;
    showApiKeysError: boolean;
    showWorkflowInfo: boolean;
    showHelp: boolean;
    previewDocument: LightweightDocument | null;
    presetName: string;
    scrapingRunId: string | null;
    workflowRunId: string | null;
}
/**
 * Initial state for the Beleidsscan reducer
 */
export declare const initialState: BeleidsscanState;
/**
 * Action types for the Beleidsscan reducer
 */
export type BeleidsscanAction = {
    type: 'SET_STEP';
    payload: number;
} | {
    type: 'SET_SHOW_GRAPH_VISUALIZER';
    payload: boolean;
} | {
    type: 'SET_SHOW_WORKFLOW_IMPORT';
    payload: boolean;
} | {
    type: 'SET_SHOW_DOCUMENT_PREVIEW';
    payload: boolean;
} | {
    type: 'SET_SHOW_PRESET_DIALOG';
    payload: boolean;
} | {
    type: 'SET_SHOW_PREVIOUS_SETS';
    payload: boolean;
} | {
    type: 'SET_SHOW_STEP2_INFO';
    payload: boolean;
} | {
    type: 'SET_SHOW_SCRAPING_INFO';
    payload: boolean;
} | {
    type: 'SET_SHOW_STEP1_INFO';
    payload: boolean;
} | {
    type: 'SET_SHOW_STEP3_INFO';
    payload: boolean;
} | {
    type: 'SET_SHOW_API_KEYS_ERROR';
    payload: boolean;
} | {
    type: 'SET_SHOW_WORKFLOW_INFO';
    payload: boolean;
} | {
    type: 'SET_SHOW_HELP';
    payload: boolean;
} | {
    type: 'SET_PREVIEW_DOCUMENT';
    payload: CanonicalDocument | LightweightDocument | null;
} | {
    type: 'SET_PRESET_NAME';
    payload: string;
} | {
    type: 'SET_SCRAPING_RUN_ID';
    payload: string | null;
} | {
    type: 'SET_WORKFLOW_RUN_ID';
    payload: string | null;
} | {
    type: 'CLOSE_ALL_MODALS';
} | {
    type: 'RESET_PRESET_DIALOG';
} | {
    type: 'RESET';
};
/**
 * Reducer function for Beleidsscan component state
 *
 * Manages step navigation, UI modal/dialog visibility, run IDs, and document preview state.
 *
 * @param state - Current state
 * @param action - Action to dispatch
 * @returns New state
 *
 * @example
 * ```tsx
 * const [state, dispatch] = useReducer(beleidsscanReducer, initialState);
 *
 * // Set step
 * dispatch({ type: 'SET_STEP', payload: 2 });
 *
 * // Show modal
 * dispatch({ type: 'SET_SHOW_DOCUMENT_PREVIEW', payload: true });
 *
 * // Close all modals
 * dispatch({ type: 'CLOSE_ALL_MODALS' });
 * ```
 */
export declare function beleidsscanReducer(state: BeleidsscanState, action: BeleidsscanAction): BeleidsscanState;
/**
 * Action creators for Beleidsscan reducer
 * These provide type-safe ways to create actions
 */
export declare const beleidsscanActions: {
    setStep: (step: number) => BeleidsscanAction;
    setShowGraphVisualizer: (show: boolean) => BeleidsscanAction;
    setShowWorkflowImport: (show: boolean) => BeleidsscanAction;
    setShowDocumentPreview: (show: boolean) => BeleidsscanAction;
    setShowPresetDialog: (show: boolean) => BeleidsscanAction;
    setShowPreviousSets: (show: boolean) => BeleidsscanAction;
    setShowStep2Info: (show: boolean) => BeleidsscanAction;
    setShowScrapingInfo: (show: boolean) => BeleidsscanAction;
    setShowStep1Info: (show: boolean) => BeleidsscanAction;
    setShowStep3Info: (show: boolean) => BeleidsscanAction;
    setShowApiKeysError: (show: boolean) => BeleidsscanAction;
    setShowWorkflowInfo: (show: boolean) => BeleidsscanAction;
    setShowHelp: (show: boolean) => BeleidsscanAction;
    setPreviewDocument: (document: CanonicalDocument | LightweightDocument | null) => BeleidsscanAction;
    setPresetName: (name: string) => BeleidsscanAction;
    setScrapingRunId: (runId: string | null) => BeleidsscanAction;
    setWorkflowRunId: (runId: string | null) => BeleidsscanAction;
    closeAllModals: () => BeleidsscanAction;
    resetPresetDialog: () => BeleidsscanAction;
    reset: () => BeleidsscanAction;
};
