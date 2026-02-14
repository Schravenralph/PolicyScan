/**
 * Document Filter Bar Component
 *
 * Filter buttons for document status (all, pending, approved, rejected).
 */
import type { CanonicalDocument } from '../../services/api';
interface DocumentFilterBarProps {
    filter: 'all' | 'pending' | 'approved' | 'rejected';
    onFilterChange: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;
    documents: CanonicalDocument[];
    filteredCount: number;
}
export declare function DocumentFilterBar({ filter, onFilterChange, documents, filteredCount, }: DocumentFilterBarProps): import("react/jsx-runtime").JSX.Element;
export {};
