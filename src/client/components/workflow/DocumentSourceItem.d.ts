/**
 * DocumentSourceItem Component
 *
 * Displays a single document in the document sources panel.
 * Shows title and source information in a minimal, clean format.
 */
import type { CanonicalDocument } from '../../services/api';
interface DocumentSourceItemProps {
    document: CanonicalDocument;
}
export declare function DocumentSourceItem({ document }: DocumentSourceItemProps): import("react/jsx-runtime").JSX.Element;
export {};
