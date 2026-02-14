/**
 * Type definitions for Feature Flags
 *
 * Extracted from FeatureFlagsPage.tsx for better organization
 */
export type FeatureFlagCategory = 'Knowledge Graph Core' | 'Knowledge Graph Advanced' | 'Legal Features' | 'Retrieval' | 'Extraction' | 'Other';
export interface FeatureFlag {
    name: string;
    enabled: boolean;
    description?: string;
    category?: FeatureFlagCategory;
    updatedAt?: string;
    updatedBy?: string;
    source: 'environment' | 'database' | 'default';
}
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}
export interface ValidationError {
    type: 'required' | 'dependency' | 'conflict' | 'mutually-exclusive';
    flag: string;
    message: string;
    relatedFlags?: string[];
}
export interface ValidationWarning {
    type: 'cascade' | 'recommendation';
    flag: string;
    message: string;
    relatedFlags?: string[];
}
export interface FlagDependencyGraph {
    flag: string;
    parents: string[];
    children: string[];
    requires: string[];
    requiredBy?: string[];
    conflicts: string[];
    mutuallyExclusiveWith: string[];
}
export interface FeatureFlagTemplate {
    _id?: string;
    name: string;
    description?: string;
    flags: Record<string, boolean>;
    isPublic: boolean;
    isDefault: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    usageCount: number;
}
export interface CategoryStats {
    total: number;
    enabled: number;
    disabled: number;
}
