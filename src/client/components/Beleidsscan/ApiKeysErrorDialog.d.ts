interface ApiKeysError {
    message: string;
    missingKeys?: {
        openai?: boolean;
        google?: boolean;
    };
    canUseMock?: boolean;
}
interface ApiKeysErrorDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    apiKeysError: ApiKeysError | null;
    onUseMockSuggestions: () => void;
}
export declare function ApiKeysErrorDialog({ isOpen, onOpenChange, apiKeysError, onUseMockSuggestions, }: ApiKeysErrorDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
