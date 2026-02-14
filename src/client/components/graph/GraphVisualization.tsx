/**
 * Graph Visualization Component
 * 
 * Handles the rendering of the ReactFlow graph visualization,
 * including empty states and error handling.
 */

import React, { useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { MetaGraphResponse } from '../../services/api';
import { t } from '../../utils/i18n';
import { DEFAULT_NODE_TYPES, DEFAULT_EDGE_TYPES } from '../../utils/reactFlowConstants';

interface GraphVisualizationProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onNodeClick: (event: React.MouseEvent, node: Node) => void;
    onPaneClick: () => void;
    graphData: MetaGraphResponse | null;
}

export function GraphVisualization({
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onNodeClick,
    onPaneClick,
    graphData,
}: GraphVisualizationProps) {
    // Memoize ReactFlow props to ensure stable references
    // Note: DEFAULT_NODE_TYPES and DEFAULT_EDGE_TYPES are already stable module-level constants
    const reactFlowProps = useMemo(() => ({
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onNodeClick,
        onPaneClick,
        nodeTypes: DEFAULT_NODE_TYPES,
        edgeTypes: DEFAULT_EDGE_TYPES,
        fitView: true,
        minZoom: 0.1,
        maxZoom: 4,
    }), [nodes, edges, onNodesChange, onEdgesChange, onNodeClick, onPaneClick]);
    
    return (
        <div className="flex-1 bg-gray-50 dark:bg-gray-900 relative">
            {nodes.length === 0 && graphData && graphData.totalNodes > 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center max-w-md">
                        <div className="text-gray-400 text-6xl mb-4">📊</div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                            {t('graphPage.noClustersFound')}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                            {t('graphPage.noClustersDescription')
                                .replace('{{count}}', graphData.totalNodes.toLocaleString())
                                .replace('{{plural}}', graphData.totalNodes !== 1 ? 's' : '')}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                            {t('graphPage.noClustersExplanation')}
                        </p>
                    </div>
                </div>
            ) : (
                <ReactFlow {...reactFlowProps}>
                    <Background color="#94a3b8" gap={20} />
                    <Controls />
                </ReactFlow>
            )}
        </div>
    );
}
