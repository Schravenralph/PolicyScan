/**
 * Custom Navigation Node Component for ReactFlow
 *
 * Displays navigation graph nodes with tooltip support for summaries
 */
import { NodeProps } from 'reactflow';
interface NavigationNodeData {
    label: string;
    url: string;
    type: 'page' | 'section' | 'document';
    summary?: string;
    title?: string;
}
export declare function CustomNavigationNode({ data }: NodeProps<NavigationNodeData>): import("react/jsx-runtime").JSX.Element;
export {};
