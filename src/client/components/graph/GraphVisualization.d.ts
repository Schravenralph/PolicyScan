/**
 * Graph Visualization Component
 *
 * Handles the rendering of the ReactFlow graph visualization,
 * including empty states and error handling.
 */
import React from 'react';
import { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import type { MetaGraphResponse } from '../../services/api';
interface GraphVisualizationProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onNodeClick: (event: React.MouseEvent, node: Node) => void;
    onPaneClick: () => void;
    graphData: MetaGraphResponse | null;
}
export declare function GraphVisualization({ nodes, edges, onNodesChange, onEdgesChange, onNodeClick, onPaneClick, graphData, }: GraphVisualizationProps): import("react/jsx-runtime").JSX.Element;
export {};
