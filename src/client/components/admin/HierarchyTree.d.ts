interface HierarchyNode {
    id: string;
    name: string;
    level: 'municipality' | 'province' | 'national' | 'european';
    parentId?: string;
    children?: HierarchyNode[];
    regulations?: Array<{
        id: string;
        title: string;
        type: string;
    }>;
}
interface HierarchyTreeProps {
    node: HierarchyNode;
    searchTerm?: string;
    onNodeSelect?: (nodeId: string) => void;
    depth?: number;
    expanded?: boolean;
}
export declare function HierarchyTree({ node, searchTerm, onNodeSelect, depth, expanded: initiallyExpanded, }: HierarchyTreeProps): import("react/jsx-runtime").JSX.Element | null;
export {};
