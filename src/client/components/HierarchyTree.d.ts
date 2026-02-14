import { HierarchyTreeNode } from './HierarchyTypes';
export type { HierarchyTreeNode } from './HierarchyTypes';
interface HierarchyTreeProps {
    rootNodeId?: string;
    onNodeClick?: (node: HierarchyTreeNode) => void;
    onDocumentClick?: (documentId: string, nodeId: string) => void;
    showDocuments?: boolean;
    className?: string;
    maxDepth?: number;
}
export declare function HierarchyTree({ rootNodeId, onNodeClick, onDocumentClick, showDocuments, className, maxDepth, }: HierarchyTreeProps): import("react/jsx-runtime").JSX.Element;
