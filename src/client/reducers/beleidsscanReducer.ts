/**
 * Beleidsscan Reducer
 * 
 * ✅ **MIGRATED** - Now uses CanonicalDocument for preview document.
 * Components can transform to Bron format for display if needed.
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import type { CanonicalDocument } from '../services/api';
import { createLightweightDocument, type LightweightDocument } from '../utils/documentStateOptimization';

/**
 * State managed by the Beleidsscan reducer
 */
export interface BeleidsscanState {
  // Step navigation
  step: number;

  // UI modal/dialog visibility
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

  // Document preview
  // ✅ MIGRATED: Now uses LightweightDocument instead of BronDocument
  previewDocument: LightweightDocument | null;

  // Preset dialog
  presetName: string;

  // Run IDs
  scrapingRunId: string | null;
  workflowRunId: string | null;
}

/**
 * Initial state for the Beleidsscan reducer
 */
export const initialState: BeleidsscanState = {
  step: 1,
  showGraphVisualizer: false,
  showWorkflowImport: false,
  showDocumentPreview: false,
  showPresetDialog: false,
  showPreviousSets: false,
  showStep2Info: false,
  showScrapingInfo: false,
  showStep1Info: false,
  showStep3Info: false,
  showApiKeysError: false,
  showWorkflowInfo: false,
  showHelp: false,
  previewDocument: null,
  presetName: '',
  scrapingRunId: null,
  workflowRunId: null,
};

/**
 * Action types for the Beleidsscan reducer
 */
export type BeleidsscanAction =
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SET_SHOW_GRAPH_VISUALIZER'; payload: boolean }
  | { type: 'SET_SHOW_WORKFLOW_IMPORT'; payload: boolean }
  | { type: 'SET_SHOW_DOCUMENT_PREVIEW'; payload: boolean }
  | { type: 'SET_SHOW_PRESET_DIALOG'; payload: boolean }
  | { type: 'SET_SHOW_PREVIOUS_SETS'; payload: boolean }
  | { type: 'SET_SHOW_STEP2_INFO'; payload: boolean }
  | { type: 'SET_SHOW_SCRAPING_INFO'; payload: boolean }
  | { type: 'SET_SHOW_STEP1_INFO'; payload: boolean }
  | { type: 'SET_SHOW_STEP3_INFO'; payload: boolean }
  | { type: 'SET_SHOW_API_KEYS_ERROR'; payload: boolean }
  | { type: 'SET_SHOW_WORKFLOW_INFO'; payload: boolean }
  | { type: 'SET_SHOW_HELP'; payload: boolean }
  | { type: 'SET_PREVIEW_DOCUMENT'; payload: CanonicalDocument | LightweightDocument | null }
  | { type: 'SET_PRESET_NAME'; payload: string }
  | { type: 'SET_SCRAPING_RUN_ID'; payload: string | null }
  | { type: 'SET_WORKFLOW_RUN_ID'; payload: string | null }
  | { type: 'CLOSE_ALL_MODALS' }
  | { type: 'RESET_PRESET_DIALOG' }
  | { type: 'RESET' };

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
export function beleidsscanReducer(
  state: BeleidsscanState,
  action: BeleidsscanAction
): BeleidsscanState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload };

    case 'SET_SHOW_GRAPH_VISUALIZER':
      return { ...state, showGraphVisualizer: action.payload };

    case 'SET_SHOW_WORKFLOW_IMPORT':
      return { ...state, showWorkflowImport: action.payload };

    case 'SET_SHOW_DOCUMENT_PREVIEW':
      return { ...state, showDocumentPreview: action.payload };

    case 'SET_SHOW_PRESET_DIALOG':
      return { ...state, showPresetDialog: action.payload };

    case 'SET_SHOW_PREVIOUS_SETS':
      return { ...state, showPreviousSets: action.payload };

    case 'SET_SHOW_STEP2_INFO':
      return { ...state, showStep2Info: action.payload };

    case 'SET_SHOW_SCRAPING_INFO':
      return { ...state, showScrapingInfo: action.payload };

    case 'SET_SHOW_STEP1_INFO':
      return { ...state, showStep1Info: action.payload };

    case 'SET_SHOW_STEP3_INFO':
      return { ...state, showStep3Info: action.payload };

    case 'SET_SHOW_API_KEYS_ERROR':
      return { ...state, showApiKeysError: action.payload };

    case 'SET_SHOW_WORKFLOW_INFO':
      return { ...state, showWorkflowInfo: action.payload };

    case 'SET_SHOW_HELP':
      return { ...state, showHelp: action.payload };

    case 'SET_PREVIEW_DOCUMENT': {
      // Strip fullText from previewDocument to prevent React DevTools 64MB limit error
      // Documents should already be lightweight, but ensure fullText is stripped as a safeguard
      // If payload is already lightweight, createLightweightDocument handles it correctly (it omits 'fullText' if present)
      const lightweightPreview = action.payload 
        ? createLightweightDocument(action.payload)
        : null;
      return { ...state, previewDocument: lightweightPreview };
    }

    case 'SET_PRESET_NAME':
      return { ...state, presetName: action.payload };

    case 'SET_SCRAPING_RUN_ID':
      return { ...state, scrapingRunId: action.payload };

    case 'SET_WORKFLOW_RUN_ID':
      return { ...state, workflowRunId: action.payload };

    case 'CLOSE_ALL_MODALS':
      return {
        ...state,
        showGraphVisualizer: false,
        showWorkflowImport: false,
        showDocumentPreview: false,
        showPresetDialog: false,
        showPreviousSets: false,
      };

    case 'RESET_PRESET_DIALOG':
      return {
        ...state,
        showPresetDialog: false,
        presetName: '',
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/**
 * Action creators for Beleidsscan reducer
 * These provide type-safe ways to create actions
 */
export const beleidsscanActions = {
  setStep: (step: number): BeleidsscanAction => ({ type: 'SET_STEP', payload: step }),
  setShowGraphVisualizer: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_GRAPH_VISUALIZER',
    payload: show,
  }),
  setShowWorkflowImport: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_WORKFLOW_IMPORT',
    payload: show,
  }),
  setShowDocumentPreview: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_DOCUMENT_PREVIEW',
    payload: show,
  }),
  setShowPresetDialog: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_PRESET_DIALOG',
    payload: show,
  }),
  setShowPreviousSets: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_PREVIOUS_SETS',
    payload: show,
  }),
  setShowStep2Info: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_STEP2_INFO',
    payload: show,
  }),
  setShowScrapingInfo: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_SCRAPING_INFO',
    payload: show,
  }),
  setShowStep1Info: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_STEP1_INFO',
    payload: show,
  }),
  setShowStep3Info: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_STEP3_INFO',
    payload: show,
  }),
  setShowApiKeysError: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_API_KEYS_ERROR',
    payload: show,
  }),
  setShowWorkflowInfo: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_WORKFLOW_INFO',
    payload: show,
  }),
  setShowHelp: (show: boolean): BeleidsscanAction => ({
    type: 'SET_SHOW_HELP',
    payload: show,
  }),
  setPreviewDocument: (document: CanonicalDocument | LightweightDocument | null): BeleidsscanAction => ({
    type: 'SET_PREVIEW_DOCUMENT',
    payload: document,
  }),
  setPresetName: (name: string): BeleidsscanAction => ({
    type: 'SET_PRESET_NAME',
    payload: name,
  }),
  setScrapingRunId: (runId: string | null): BeleidsscanAction => ({
    type: 'SET_SCRAPING_RUN_ID',
    payload: runId,
  }),
  setWorkflowRunId: (runId: string | null): BeleidsscanAction => ({
    type: 'SET_WORKFLOW_RUN_ID',
    payload: runId,
  }),
  closeAllModals: (): BeleidsscanAction => ({ type: 'CLOSE_ALL_MODALS' }),
  resetPresetDialog: (): BeleidsscanAction => ({ type: 'RESET_PRESET_DIALOG' }),
  reset: (): BeleidsscanAction => ({ type: 'RESET' }),
};

