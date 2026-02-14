import React from 'react';
import { Bron } from '../utils/transformations';
export interface WebsiteCardProps {
    /** Legacy Bron format (for websites and custom documents) */
    bron: Bron;
    onStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => void;
    onRemove?: (id: string) => void;
    onDocumentClick?: (documentId: string) => void;
    isCustom?: boolean;
    searchQuery?: string;
}
export declare const WebsiteCard: React.NamedExoticComponent<WebsiteCardProps>;
