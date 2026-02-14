/**
 * Graph Node Details Panel Component
 *
 * Displays detailed information about a selected cluster node.
 */
import type { ClusterNode } from '../../services/api';
interface GraphNodeDetailsPanelProps {
    selectedNode: ClusterNode;
    onClose: () => void;
}
export declare function GraphNodeDetailsPanel({ selectedNode, onClose }: GraphNodeDetailsPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
