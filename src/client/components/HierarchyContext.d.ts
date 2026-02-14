import type { HierarchyLevel } from '../../shared/types.js';
export interface HierarchyNode {
    id: string;
    name: string;
    level: HierarchyLevel;
    children?: HierarchyNode[];
    url?: string;
    documentCount?: number;
}
interface HierarchyContextProps {
    jurisdictionId: string;
    onNodeClick?: (node: HierarchyNode) => void;
    className?: string;
}
export declare function HierarchyContext({ jurisdictionId, className }: HierarchyContextProps): import("react/jsx-runtime").JSX.Element;
export {};
