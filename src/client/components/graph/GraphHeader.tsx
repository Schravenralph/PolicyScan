/**
 * Graph Header Component
 * 
 * Displays the graph page header with title, statistics, and subgraph selector.
 */

import { SubgraphSelector } from '../SubgraphSelector';
import type { Subgraph, MetaGraphResponse } from '../../services/api';
import type { NavigationGraphResponse } from '../../services/api';
import type { GraphHealthResponse } from '../../services/api';
import { t } from '../../utils/i18n';

interface GraphHeaderProps {
    selectedSubgraph: Subgraph | null;
    visualizationMode: 'meta' | 'connected' | 'all' | 'clustered';
    graphData: MetaGraphResponse | null;
    navigationGraphData: NavigationGraphResponse | null;
    graphHealth: GraphHealthResponse | null;
    onSubgraphSelect: (subgraph: Subgraph | null) => void;
}

export function GraphHeader({
    selectedSubgraph,
    visualizationMode,
    graphData,
    navigationGraphData,
    graphHealth,
    onSubgraphSelect,
}: GraphHeaderProps) {
    return (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedSubgraph ? selectedSubgraph.name : t('graphPage.navigationNetwork')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedSubgraph ? (
                        <>
                            {selectedSubgraph.metadata?.totalNodes ?? 0} {t('graphPage.nodes')} • 
                            {selectedSubgraph.metadata?.approvedCount ?? 0} {t('graphPage.approved')} • 
                            {selectedSubgraph.metadata?.pendingCount ?? 0} {t('graphPage.pending')}
                        </>
                    ) : visualizationMode === 'meta' ? (
                        <>
                            {graphData?.totalClusters ?? 0} {t('graphPage.themes')} • {(graphData?.totalNodes ?? 0).toLocaleString()} {t('graphPage.pages')}
                            {graphHealth && graphHealth.connectivity.connectivityRatio > 0 && (
                                <> • {Math.round(graphHealth.connectivity.connectivityRatio * 100)}% {t('graphPage.connected')}</>
                            )}
                        </>
                    ) : (
                        <>
                            {navigationGraphData?.metadata.nodesReturned ?? 0} / {navigationGraphData?.metadata.totalNodesInGraph ?? 0} {t('graphPage.nodes')} • 
                            {t('graphPage.mode')}: {navigationGraphData?.metadata.visualizationMode ?? visualizationMode}
                        </>
                    )}
                </p>
            </div>
            <SubgraphSelector 
                onSelect={onSubgraphSelect} 
                selectedId={selectedSubgraph?.id}
            />
        </div>
    );
}
