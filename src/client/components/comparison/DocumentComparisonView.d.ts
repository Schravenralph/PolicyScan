/**
 * Document Comparison View Component
 *
 * Displays structured document-to-document comparison results including:
 * - Matched concepts with evidence bundles
 * - Differences (changed, conflicting, A-only, B-only)
 * - Confidence scores
 * - Summary statistics
 *
 * @see docs/21-issues/WI-COMPARISON-001-structured-document-comparison.md
 */
interface DocumentComparisonViewProps {
    documentAId?: string;
    documentBId?: string;
    onDocumentSelect?: (side: 'A' | 'B', documentId: string) => void;
}
export declare function DocumentComparisonView({ documentAId, documentBId, onDocumentSelect: _onDocumentSelect, }: DocumentComparisonViewProps): import("react/jsx-runtime").JSX.Element;
export {};
