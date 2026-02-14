import 'reactflow/dist/style.css';
interface GraphStreamNode {
    id: string;
    url: string;
    title: string;
    type: 'page' | 'section' | 'document';
    children: string[];
    lastVisited?: string;
    hasChildren?: boolean;
    childCount?: number;
    score?: number;
    depth?: number;
}
export interface GraphStreamData {
    runId: string;
    timestamp: string;
    nodes: GraphStreamNode[];
    childNodes?: GraphStreamNode[];
    edges: Array<{
        source: string;
        target: string;
    }>;
    stats: {
        totalNodes: number;
        totalEdges: number;
        displayedNode?: string;
        childCount?: number;
        navigatedCount?: number;
    };
    message?: string;
}
interface RealTimeGraphVisualizerProps {
    runId: string;
    onClose?: () => void;
}
export declare function RealTimeGraphVisualizer({ runId, onClose }: RealTimeGraphVisualizerProps): import("react/jsx-runtime").JSX.Element;
export {};
