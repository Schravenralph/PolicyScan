export interface DocumentCollectionSelectorProps {
    documentId: string;
    currentCollectionIds: string[];
    onCollectionsChange?: (collectionIds: string[]) => void;
    className?: string;
}
export declare function DocumentCollectionSelector({ documentId, currentCollectionIds, onCollectionsChange, className, }: DocumentCollectionSelectorProps): import("react/jsx-runtime").JSX.Element;
