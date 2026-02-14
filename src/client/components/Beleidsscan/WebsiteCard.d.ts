/**
 * Website Card Component
 *
 * Individual website card for selection with checkbox, title, URL,
 * summary, relevance, and website types.
 */
import type { BronWebsite } from '../../services/api';
interface WebsiteCardProps {
    website: BronWebsite;
    websiteId: string;
    isSelected: boolean;
    onToggle: () => void;
}
declare function WebsiteCardComponent({ website, websiteId, isSelected, onToggle, }: WebsiteCardProps): import("react/jsx-runtime").JSX.Element;
export declare const WebsiteCard: import("react").MemoExoticComponent<typeof WebsiteCardComponent>;
export {};
