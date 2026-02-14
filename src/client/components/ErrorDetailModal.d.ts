interface ErrorDetailModalProps {
    errorId: string | null;
    onClose: () => void;
    onResolve?: () => void;
}
export declare function ErrorDetailModal({ errorId, onClose, onResolve }: ErrorDetailModalProps): import("react/jsx-runtime").JSX.Element | null;
export {};
