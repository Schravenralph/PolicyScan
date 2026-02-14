/**
 * FeatureFlagBulkEditor Component
 *
 * Handles bulk editing of feature flags.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */
import type { FeatureFlag } from '../../types/featureFlags.js';
export interface FeatureFlagBulkEditorProps {
    bulkEditMode: boolean;
    bulkFlags: Record<string, boolean>;
    bulkConfigName: string;
    applyingBulk: boolean;
    databaseFlags: FeatureFlag[];
    onStartBulkEdit: () => void;
    onCancelBulkEdit: () => void;
    onUpdateBulkFlag: (flagName: string, enabled: boolean) => void;
    onBulkConfigNameChange: (name: string) => void;
    onApplyBulkConfig: () => Promise<void>;
}
/**
 * Bulk editor component for feature flags
 */
export declare function FeatureFlagBulkEditor({ bulkEditMode, bulkFlags, bulkConfigName, applyingBulk, databaseFlags, onStartBulkEdit, onCancelBulkEdit, onUpdateBulkFlag, onBulkConfigNameChange, onApplyBulkConfig, }: FeatureFlagBulkEditorProps): import("react/jsx-runtime").JSX.Element;
