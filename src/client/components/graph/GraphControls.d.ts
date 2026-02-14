/**
 * Graph Controls Component
 *
 * Handles graph visualization controls including:
 * - Layout selector
 * - Visualization mode selector
 * - Health indicators and status badges
 */
import { LayoutAlgorithm } from '../LayoutSelector';
import type { GraphHealthResponse } from '../../services/api';
interface GraphControlsProps {
    currentLayout: LayoutAlgorithm;
    onLayoutChange: (layout: LayoutAlgorithm) => void;
    visualizationMode: 'meta' | 'connected' | 'all' | 'clustered';
    onModeChange: (mode: string) => void;
    graphHealth: GraphHealthResponse | null;
    previousNodeCount: number;
    realTimeNodeCount: number | null;
    showHelpPanel: boolean;
    onToggleHelpPanel: () => void;
}
export declare function GraphControls({ currentLayout, onLayoutChange, visualizationMode, onModeChange, graphHealth, previousNodeCount, realTimeNodeCount, showHelpPanel: _showHelpPanel, onToggleHelpPanel, }: GraphControlsProps): import("react/jsx-runtime").JSX.Element;
export {};
