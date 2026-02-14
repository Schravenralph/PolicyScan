/**
 * DocumentCard Component
 *
 * ✅ **MIGRATED** - Uses CanonicalDocument directly.
 * Replaces BronCard usage with native implementation.
 *
 * @see WI-MIGRATION-002: Migrate DocumentCard to CanonicalDocument
 */
import React from 'react';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
interface DocumentCardProps {
    document: CanonicalDocument | LightweightDocument;
    selected: boolean;
    onSelect: (id: string) => void;
    onPreview: (document: CanonicalDocument | LightweightDocument) => void;
    onStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => Promise<void>;
    searchQuery?: string;
}
declare function DocumentCardComponent({ document, selected, onSelect, onPreview, onStatusChange, searchQuery, }: DocumentCardProps): React.ReactElement;
export declare const DocumentCard: React.MemoExoticComponent<typeof DocumentCardComponent>;
export {};
