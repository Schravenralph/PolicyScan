import { HierarchyLevel } from '../../shared/types';
export interface HierarchyBreadcrumbItem {
    id: string;
    name: string;
    level: HierarchyLevel;
    url?: string;
}
interface HierarchyBreadcrumbProps {
    items: HierarchyBreadcrumbItem[];
    onItemClick?: (item: HierarchyBreadcrumbItem) => void;
    className?: string;
}
export declare function HierarchyBreadcrumb({ items, onItemClick, className }: HierarchyBreadcrumbProps): import("react/jsx-runtime").JSX.Element | null;
export {};
