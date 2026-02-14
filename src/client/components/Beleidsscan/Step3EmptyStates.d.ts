/**
 * Step3 Empty States Component
 *
 * Empty state displays for no documents found and no filtered documents.
 */
interface Step3EmptyStatesProps {
    hasDocuments: boolean;
    hasFilteredDocuments: boolean;
    documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
    onClearFilter: () => void;
    onGoToStep2: () => void;
    onOpenWorkflowImport: () => void;
}
declare function Step3EmptyStatesComponent({ hasDocuments, hasFilteredDocuments, documentFilter, onClearFilter, onGoToStep2, onOpenWorkflowImport, }: Step3EmptyStatesProps): import("react/jsx-runtime").JSX.Element | null;
export declare const Step3EmptyStates: import("react").MemoExoticComponent<typeof Step3EmptyStatesComponent>;
export {};
