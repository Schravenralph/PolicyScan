/**
 * FeatureFlagList Component
 *
 * Main flag list rendering component for FeatureFlagsPage.
 * Handles grouped view, list view, environment flags, and dependency viewer.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */
import type { FeatureFlag, FeatureFlagCategory, ValidationError, ValidationWarning, FlagDependencyGraph, CategoryStats } from '../../types/featureFlags.js';
export interface FeatureFlagListProps {
    environmentFlags: FeatureFlag[];
    databaseFlags: FeatureFlag[];
    filteredDatabaseFlags: FeatureFlag[];
    filteredIndependentFlags: FeatureFlag[];
    filteredDependentFlags: FeatureFlag[];
    flagsByCategory: Record<FeatureFlagCategory, FeatureFlag[]>;
    categoryStats: Record<FeatureFlagCategory, CategoryStats>;
    categories: FeatureFlagCategory[];
    viewMode: 'list' | 'grouped';
    selectedCategory: FeatureFlagCategory | 'All';
    onCategoryChange: (category: FeatureFlagCategory | 'All') => void;
    draftMode: boolean;
    draftFlags: Record<string, boolean>;
    updating: Set<string>;
    validationErrors: Record<string, ValidationError[]>;
    validationWarnings: Record<string, ValidationWarning[]>;
    dependencyGraphs: Map<string, FlagDependencyGraph>;
    selectedFlagForDeps: string | null;
    showDependencies: boolean;
    onUpdateFlag: (flagName: string, enabled: boolean) => void;
    onViewDependencies: (flagName: string) => void;
    onCloseDependencies: () => void;
    onEnableCategoryFlags: (category: FeatureFlagCategory) => void;
    onDisableCategoryFlags: (category: FeatureFlagCategory) => void;
    getFlagState: (flag: FeatureFlag) => boolean;
}
/**
 * Main feature flag list component
 */
export declare function FeatureFlagList({ environmentFlags, databaseFlags, filteredDatabaseFlags: _filteredDatabaseFlags, filteredIndependentFlags, filteredDependentFlags, flagsByCategory, categoryStats, categories, viewMode, selectedCategory, onCategoryChange, draftMode, draftFlags, updating, validationErrors, validationWarnings, dependencyGraphs, selectedFlagForDeps, showDependencies, onUpdateFlag, onViewDependencies, onCloseDependencies, onEnableCategoryFlags, onDisableCategoryFlags, getFlagState, }: FeatureFlagListProps): import("react/jsx-runtime").JSX.Element;
