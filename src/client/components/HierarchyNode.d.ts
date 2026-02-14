import { HierarchyTreeNode } from './HierarchyTypes';
interface HierarchyNodeProps {
    node: HierarchyTreeNode;
    depth?: number;
    expandedNodes: Set<string>;
    expandedDocuments: Set<string>;
    toggleNode: (nodeId: string) => void;
    toggleDocuments: (nodeId: string) => void;
    onNodeClick?: (node: HierarchyTreeNode) => void;
    onDocumentClick?: (documentId: string, nodeId: string) => void;
    showDocuments?: boolean;
}
export declare const HierarchyNode: import("react").NamedExoticComponent<HierarchyNodeProps>;
export {};
