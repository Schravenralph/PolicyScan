import React from 'react';
type FilterPreset = {
    id: string;
    name: string;
    filters: {
        documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
        documentTypeFilter: string | null;
        documentDateFilter: 'all' | 'week' | 'month' | 'year';
        documentWebsiteFilter: string | null;
        documentSearchQuery: string;
    };
};
type WebsiteInfo = {
    url: string;
    title: string;
};
interface FilterControlsProps {
    documentSearchQuery: string;
    setDocumentSearchQuery: (query: string) => void;
    documentSortBy: 'relevance' | 'date' | 'title' | 'website';
    documentSortDirection: 'asc' | 'desc';
    setDocumentSortBy: (sortBy: 'relevance' | 'date' | 'title' | 'website') => void;
    setDocumentSortDirection: (direction: 'asc' | 'desc') => void;
    documentTypeFilter: string | null;
    documentDateFilter: 'all' | 'week' | 'month' | 'year';
    documentWebsiteFilter: string | null;
    documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
    setDocumentTypeFilter: (filter: string | null) => void;
    setDocumentDateFilter: (filter: 'all' | 'week' | 'month' | 'year') => void;
    setDocumentWebsiteFilter: (filter: string | null) => void;
    setDocumentFilter: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;
    uniqueDocumentTypes: string[];
    uniqueDocumentWebsites: WebsiteInfo[];
    filterPresets: FilterPreset[];
    deleteFilterPreset: (presetId: string) => void;
    isLoadingDocuments: boolean;
    setShowPresetDialog: (show: boolean) => void;
    setPresetName: (name: string) => void;
}
declare function FilterControlsComponent({ documentSearchQuery, setDocumentSearchQuery, documentSortBy, documentSortDirection, setDocumentSortBy, setDocumentSortDirection, documentTypeFilter, documentDateFilter, documentWebsiteFilter, documentFilter, setDocumentTypeFilter, setDocumentDateFilter, setDocumentWebsiteFilter, setDocumentFilter, uniqueDocumentTypes, uniqueDocumentWebsites, filterPresets, deleteFilterPreset, isLoadingDocuments, setShowPresetDialog, setPresetName, }: FilterControlsProps): React.ReactElement;
export declare const FilterControls: React.MemoExoticComponent<typeof FilterControlsComponent>;
export {};
