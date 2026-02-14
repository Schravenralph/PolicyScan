/**
 * Website List Component
 *
 * List of website cards with empty state handling.
 */
import type { BronWebsite } from '../../services/api';
interface WebsiteListProps {
    websites: BronWebsite[];
    selectedWebsites: string[];
    onToggleSelection: (websiteId: string) => void;
    onClearFilters: () => void;
    totalWebsites: number;
}
declare function WebsiteListComponent({ websites, selectedWebsites, onToggleSelection, onClearFilters, totalWebsites: _totalWebsites, }: WebsiteListProps): import("react/jsx-runtime").JSX.Element;
export declare const WebsiteList: import("react").MemoExoticComponent<typeof WebsiteListComponent>;
export {};
