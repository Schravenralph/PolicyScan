/**
 * Draft Status Indicator Component
 *
 * Shows draft status with last saved timestamp and summary.
 */
import type { DraftSummary } from '../../hooks/useDraftPersistence.js';
interface DraftStatusIndicatorProps {
    hasDraft: boolean;
    lastDraftSavedAt: string | null;
    lastDraftSummary: DraftSummary | null;
    formatTimestamp: (timestamp?: string | null) => string | null;
}
declare function DraftStatusIndicatorComponent({ hasDraft, lastDraftSavedAt, lastDraftSummary, formatTimestamp, }: DraftStatusIndicatorProps): import("react/jsx-runtime").JSX.Element | null;
export declare const DraftStatusIndicator: import("react").MemoExoticComponent<typeof DraftStatusIndicatorComponent>;
export {};
