import type { DocumentTag } from '../services/api/DocumentTagApiService';
export interface DocumentTagBadgeProps {
    tag: DocumentTag;
    onRemove?: (tagId: string) => void;
    className?: string;
}
export declare function DocumentTagBadge({ tag, onRemove, className }: DocumentTagBadgeProps): import("react/jsx-runtime").JSX.Element;
