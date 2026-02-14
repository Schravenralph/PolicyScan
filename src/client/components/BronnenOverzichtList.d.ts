/**
 * BronnenOverzicht List Component
 *
 * Displays custom bronnen list and main bronnen list with grouping,
 * loading state, and empty state handling.
 */
import type { Bron } from '../utils/transformations';
import type { CanonicalDocument } from '../services/api';
import type { MetadataFilters } from './MetadataFilterPanel';
import type { GroupingOption } from './MetadataGroupingSelector';
interface GroupedItem {
    type: 'document' | 'website';
    document?: CanonicalDocument;
    bron?: Bron;
}
interface BronnenOverzichtListProps {
    customBronnen: Bron[];
    filters: MetadataFilters;
    onCustomBronStatusChange: (bronId: string, status: 'approved' | 'rejected' | 'pending') => void;
    onRemoveCustomBron: (bronId: string) => void;
    groupedItems: Record<string, GroupedItem[]>;
    grouping: GroupingOption;
    isFetchingBronnen: boolean;
    totalCount: number;
    onWebsiteStatusChange: (bronId: string, status: 'approved' | 'rejected' | 'pending') => void;
    onDocumentStatusChange: (documentId: string, status: 'approved' | 'rejected' | 'pending') => void;
}
export declare function BronnenOverzichtList({ customBronnen, filters, onCustomBronStatusChange, onRemoveCustomBron, groupedItems, grouping, isFetchingBronnen, totalCount, onWebsiteStatusChange, onDocumentStatusChange, }: BronnenOverzichtListProps): import("react/jsx-runtime").JSX.Element;
export {};
