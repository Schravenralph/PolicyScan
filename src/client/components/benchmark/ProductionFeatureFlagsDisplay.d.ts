/**
 * Production Feature Flags Display Component
 *
 * Displays the current production feature flags configuration.
 */
interface FeatureFlag {
    name: string;
    enabled: boolean;
    description?: string;
    source: 'environment' | 'database' | 'default';
}
interface ProductionFeatureFlagsDisplayProps {
    flags: FeatureFlag[];
}
export declare function ProductionFeatureFlagsDisplay({ flags }: ProductionFeatureFlagsDisplayProps): import("react/jsx-runtime").JSX.Element;
export {};
