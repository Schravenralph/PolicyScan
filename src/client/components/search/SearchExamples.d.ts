/**
 * Search Examples Component
 *
 * Displays example searches to help users learn how to use the search functionality.
 */
import type { JurisdictionLevel } from '../../pages/SearchPage';
interface SearchExamplesProps {
    onExampleSelect: (example: {
        topic: string;
        location: string;
        jurisdiction: JurisdictionLevel;
    }) => void;
}
export declare function SearchExamples({ onExampleSelect }: SearchExamplesProps): import("react/jsx-runtime").JSX.Element;
export {};
