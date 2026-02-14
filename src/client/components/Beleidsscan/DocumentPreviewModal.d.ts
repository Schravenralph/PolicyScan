/**
 * DocumentPreviewModal Component
 *
 * ✅ **MIGRATED** - Now accepts ONLY CanonicalDocument.
 * Uses canonical document utilities to extract fields consistently.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import React from 'react';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
export interface DocumentPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    document: CanonicalDocument | LightweightDocument | null;
    onStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => void;
}
export declare const DocumentPreviewModal: React.NamedExoticComponent<DocumentPreviewModalProps>;
