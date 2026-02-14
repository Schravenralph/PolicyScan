/**
 * Selected Websites Summary Component
 *
 * Displays a summary list of selected websites.
 */
import type { BronWebsite } from '../../services/api';
interface SelectedWebsitesSummaryProps {
    selectedWebsites: string[];
    suggestedWebsites: BronWebsite[];
}
declare function SelectedWebsitesSummaryComponent({ selectedWebsites, suggestedWebsites, }: SelectedWebsitesSummaryProps): import("react/jsx-runtime").JSX.Element | null;
export declare const SelectedWebsitesSummary: import("react").MemoExoticComponent<typeof SelectedWebsitesSummaryComponent>;
export {};
