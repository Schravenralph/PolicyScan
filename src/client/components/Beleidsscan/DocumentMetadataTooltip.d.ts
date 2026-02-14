/**
 * DocumentMetadataTooltip Component
 *
 * Displays document metadata in a hover tooltip after a 2-second delay.
 * Shows title and text preview in an accessible format.
 *
 * @see Plan: Document Metadata Hover Tooltip Implementation
 */
import React from 'react';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
interface DocumentMetadataTooltipProps {
    document: CanonicalDocument | LightweightDocument;
    children: React.ReactNode;
    /** Maximum number of characters to show in text preview */
    textPreviewLength?: number;
}
export declare function DocumentMetadataTooltip({ document, children, textPreviewLength, }: DocumentMetadataTooltipProps): import("react/jsx-runtime").JSX.Element;
export {};
