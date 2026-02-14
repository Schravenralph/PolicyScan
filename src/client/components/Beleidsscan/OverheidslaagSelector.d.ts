/**
 * Overheidslaag Selector Component
 *
 * Radio button grid for selecting government layer (overheidslaag)
 * with keyboard navigation and validation.
 */
import React from 'react';
type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
interface Overheidslaag {
    id: WebsiteType;
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    color: string;
}
interface OverheidslaagSelectorProps {
    overheidslagen: Overheidslaag[];
    selectedOverheidslaag: WebsiteType | null;
    onSelect: (id: WebsiteType) => void;
    validationError?: string;
}
declare function OverheidslaagSelectorComponent({ overheidslagen, selectedOverheidslaag, onSelect, validationError, }: OverheidslaagSelectorProps): import("react/jsx-runtime").JSX.Element;
export declare const OverheidslaagSelector: React.MemoExoticComponent<typeof OverheidslaagSelectorComponent>;
export {};
