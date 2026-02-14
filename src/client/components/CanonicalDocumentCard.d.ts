import React from 'react';
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
export interface CanonicalDocumentCardProps {
    document: CanonicalDocument | LightweightDocument;
    onStatusChange?: (id: string, status: 'approved' | 'rejected' | 'pending') => void;
    onDocumentClick?: (documentId: string) => void;
    searchQuery?: string;
}
export declare const CanonicalDocumentCard: React.NamedExoticComponent<CanonicalDocumentCardProps>;
