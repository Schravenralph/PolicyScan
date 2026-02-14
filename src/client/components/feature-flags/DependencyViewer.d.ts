/**
 * Dependency Viewer Component
 *
 * Modal/dialog for viewing feature flag dependencies.
 */
import type { FlagDependencyGraph } from '../../types/featureFlags.js';
interface DependencyViewerProps {
    flagName: string;
    dependencyGraphs: Map<string, FlagDependencyGraph>;
    onClose: () => void;
}
export declare function DependencyViewer({ flagName, dependencyGraphs, onClose, }: DependencyViewerProps): import("react/jsx-runtime").JSX.Element;
export {};
