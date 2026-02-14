import type { HierarchyLevel } from '../../shared/types.js';

export interface HierarchyTreeNode {
    id: string;
    name: string;
    level: HierarchyLevel;
    children?: HierarchyTreeNode[];
    parentId?: string;
    url?: string;
    documentCount?: number;
    documents?: Array<{ id: string; name: string; url?: string }>;
}
