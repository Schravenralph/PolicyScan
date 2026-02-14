/**
 * Graph Controls Component
 * 
 * Handles graph visualization controls including:
 * - Layout selector
 * - Visualization mode selector
 * - Health indicators and status badges
 */

import { LayoutSelector, LayoutAlgorithm } from '../LayoutSelector';
import type { GraphHealthResponse } from '../../services/api';
import { t } from '../../utils/i18n';

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

export function GraphControls({
    currentLayout,
    onLayoutChange,
    visualizationMode,
    onModeChange,
    graphHealth,
    previousNodeCount,
    realTimeNodeCount,
    showHelpPanel: _showHelpPanel,
    onToggleHelpPanel,
}: GraphControlsProps) {
    return (
        <div className="flex items-center gap-4 p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <LayoutSelector currentLayout={currentLayout} onLayoutChange={onLayoutChange} />
            <div className="flex items-center gap-2">
                <label htmlFor="visualization-mode" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('graphPage.viewMode')}:
                </label>
                <select
                    id="visualization-mode"
                    value={visualizationMode}
                    onChange={(e) => onModeChange(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
                    <option value="meta">{t('graphPage.metaGraph')}</option>
                    <option value="connected">{t('graphPage.connectedGraph')}</option>
                    <option value="all">{t('graphPage.allNodes')}</option>
                    <option value="clustered">{t('graphPage.clusteredView')}</option>
                </select>
            </div>
            {graphHealth && (
                <div className="ml-auto flex items-center gap-2">
                    {/* Node count badge with animation when count changes */}
                    <span
                        className={`px-3 py-1 text-sm font-medium rounded-full transition-all duration-300 ${
                            previousNodeCount < graphHealth.totalNodes
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                        title={t('graphPage.totalNodesTitle').replace('{{count}}', String(graphHealth.totalNodes))}
                    >
                        📊 {graphHealth.totalNodes} {graphHealth.totalNodes === 1 ? t('graphPage.node') : t('graphPage.nodes')}
                    </span>
                    <button
                        onClick={onToggleHelpPanel}
                        className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                        title={t('graphPage.showHelpTitle')}
                        aria-label={t('graphPage.showHelp')}
                    >
                        ❓ {t('graphPage.help')}
                    </button>
                    {realTimeNodeCount !== null && realTimeNodeCount !== graphHealth.totalNodes && (
                        <span
                            className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse"
                            title={t('graphPage.realTimeUpdateTitle')}
                        >
                            🔄 {realTimeNodeCount.toLocaleString()} {t('graphPage.nodes')}
                        </span>
                    )}
                    <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            graphHealth.status === 'healthy'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : graphHealth.status === 'warning'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                        title={t('graphPage.graphHealthTitle')
                            .replace('{{status}}', graphHealth.status)
                            .replace('{{nodes}}', String(graphHealth.totalNodes))
                            .replace('{{edges}}', String(graphHealth.totalEdges))
                            .replace('{{root}}', graphHealth.connectivity.hasRoot ? t('graphPage.hasRoot') : t('graphPage.noRoot'))}
                    >
                        {graphHealth.status === 'healthy' ? '✓' : graphHealth.status === 'warning' ? '⚠' : '✗'} {graphHealth.status}
                    </span>
                </div>
            )}
        </div>
    );
}
