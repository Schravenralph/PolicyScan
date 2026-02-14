/**
 * Entity Selector Component
 *
 * Command component for searching and selecting a specific entity
 * (municipality, water board, province, etc.) with validation.
 */
type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
interface Overheidslaag {
    id: WebsiteType;
    label: string;
}
interface EntitySelectorProps {
    overheidslaag: WebsiteType | null;
    overheidslagen: Overheidslaag[];
    selectedEntity: string;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onEntitySelect: (entity: string) => void;
    filteredEntities: string[];
    validationError?: string;
    isLoadingJurisdictions: boolean;
}
declare function EntitySelectorComponent({ overheidslaag, overheidslagen, selectedEntity, searchQuery, onSearchChange, onEntitySelect, filteredEntities, validationError, isLoadingJurisdictions, }: EntitySelectorProps): import("react/jsx-runtime").JSX.Element | null;
export declare const EntitySelector: import("react").MemoExoticComponent<typeof EntitySelectorComponent>;
export {};
