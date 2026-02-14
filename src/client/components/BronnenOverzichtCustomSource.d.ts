/**
 * BronnenOverzicht Custom Source Component
 *
 * Form for adding custom document URL.
 */
interface BronnenOverzichtCustomSourceProps {
    customBronUrl: string;
    onUrlChange: (url: string) => void;
    onAdd: () => void;
    isLoading: boolean;
}
export declare function BronnenOverzichtCustomSource({ customBronUrl, onUrlChange, onAdd, isLoading, }: BronnenOverzichtCustomSourceProps): import("react/jsx-runtime").JSX.Element;
export {};
