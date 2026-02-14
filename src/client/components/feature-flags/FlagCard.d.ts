/**
 * Flag Card Component
 *
 * Individual feature flag card with toggle, validation, and dependency viewer.
 */
import type { FeatureFlag, ValidationError, ValidationWarning } from '../../types/featureFlags.js';
interface FlagCardProps {
    flag: FeatureFlag;
    draftMode: boolean;
    draftFlags: Record<string, boolean>;
    updating: Set<string>;
    validationErrors: Record<string, ValidationError[]>;
    validationWarnings: Record<string, ValidationWarning[]>;
    onUpdateFlag: (flagName: string, enabled: boolean) => void;
    onViewDependencies: (flagName: string) => void;
    getFlagState: (flag: FeatureFlag) => boolean;
    depth?: number;
    hasChildren?: boolean;
}
export declare function FlagCard({ flag, draftMode, draftFlags, updating, validationErrors, validationWarnings, onUpdateFlag, onViewDependencies, getFlagState, depth, hasChildren, }: FlagCardProps): import("react/jsx-runtime").JSX.Element;
export {};
