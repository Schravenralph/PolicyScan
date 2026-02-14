interface GraphVisualizerModalProps {
    isOpen: boolean;
    scrapingRunId: string | null;
    queryId?: string | null;
    onClose: () => void;
}
export declare function GraphVisualizerModal({ isOpen, scrapingRunId, queryId, onClose, }: GraphVisualizerModalProps): import("react/jsx-runtime").JSX.Element | null;
export {};
