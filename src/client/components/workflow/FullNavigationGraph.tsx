/**
 * FullNavigationGraph Component
 * 
 * Displays the full navigation graph when no active workflow run is present.
 * Uses the same rendering logic as GraphPage but simplified for WorkflowPage context.
 */

import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    Controls,
    Background,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../../services/api';
import { renderNavigationGraph } from '../../utils/graphRenderingUtils';
import { logError } from '../../utils/errorHandler';
import { DEFAULT_NODE_TYPES, DEFAULT_EDGE_TYPES } from '../../utils/reactFlowConstants';

interface FullNavigationGraphProps {
    className?: string;
}

function FullNavigationGraphInner({ className = '' }: FullNavigationGraphProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { fitView } = useReactFlow();

    const loadFullGraph = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Request nodes - use a reasonable limit that backend can handle
            // If backend fails, try with smaller limit as fallback
            let data;
            try {
                data = await api.graph.getGraph({
                    mode: 'connected',
                    maxNodes: 200,
                    maxDepth: 3,
                });
            } catch (firstErr) {
                // If 200 fails, try with smaller limit (backend might have restrictions)
                try {
                    data = await api.graph.getGraph({
                        mode: 'connected',
                        maxNodes: 100,
                        maxDepth: 3,
                    });
                } catch (secondErr) {
                    // If that also fails, try with default (50)
                    data = await api.graph.getGraph({
                        mode: 'connected',
                        maxNodes: 50,
                        maxDepth: 3,
                    });
                }
            }
            
            // Filter to top 50 most recently visited nodes
            renderNavigationGraph(
                data,
                'dagre',
                setNodes,
                setEdges,
                setIsLoading,
                fitView,
                50 // maxNodes: limit to top 50 most recent
            );
        } catch (err) {
            logError(err as Error, 'load-full-navigation-graph');
            setError(err instanceof Error ? err.message : 'Failed to load navigation graph');
            setIsLoading(false);
        }
    }, [setNodes, setEdges, fitView]);

    useEffect(() => {
        loadFullGraph();
    }, [loadFullGraph]);

    if (error) {
        return (
            <div className={`h-full flex items-center justify-center ${className}`}>
                <div className="text-center text-red-500">
                    <p>Fout bij laden van graph: {error}</p>
                    <button
                        onClick={loadFullGraph}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Opnieuw proberen
                    </button>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className={`h-full flex items-center justify-center ${className}`}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Navigation graph laden...</p>
                </div>
            </div>
        );
    }

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={DEFAULT_NODE_TYPES}
            edgeTypes={DEFAULT_EDGE_TYPES}
            fitView
            attributionPosition="bottom-left"
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
        >
            <Background />
            <Controls />
        </ReactFlow>
    );
}

export function FullNavigationGraph({ className = '' }: FullNavigationGraphProps) {
    return (
        <ReactFlowProvider>
            <div className={`h-full w-full ${className}`}>
                <FullNavigationGraphInner className={className} />
            </div>
        </ReactFlowProvider>
    );
}
