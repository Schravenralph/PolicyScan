export interface DocumentTagEditorProps {
    documentId: string;
    currentTags: string[];
    onTagsChange?: (tagIds: string[]) => void;
    className?: string;
}
export declare function DocumentTagEditor({ documentId, currentTags, onTagsChange, className, }: DocumentTagEditorProps): import("react/jsx-runtime").JSX.Element;
