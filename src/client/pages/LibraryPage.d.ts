import type { CanonicalDocument } from '../services/api';
interface LibraryPageProps {
    onDocumentSelect?: (documents: CanonicalDocument[]) => void;
}
export declare function LibraryPage({ onDocumentSelect }: LibraryPageProps): import("react/jsx-runtime").JSX.Element;
export {};
