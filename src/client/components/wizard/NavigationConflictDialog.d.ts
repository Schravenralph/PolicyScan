/**
 * NavigationConflictDialog - Dialog for resolving navigation revision conflicts
 *
 * Shows both local and server states when a revision conflict occurs,
 * allowing users to choose which state to keep or merge them.
 */
export interface ConflictState {
    stepId: string;
    stepName: string;
    completedSteps: string[];
    context: Record<string, unknown>;
    revision: number;
}
export interface NavigationConflict {
    localState: ConflictState;
    serverState: ConflictState;
    expectedRevision: number;
    actualRevision: number;
    targetStepId: string;
}
interface NavigationConflictDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    conflict: NavigationConflict | null;
    onUseLocal: () => void;
    onUseServer: () => void;
    onMerge?: () => void;
    onRetry?: () => void;
    onIgnore?: () => void;
}
export declare function NavigationConflictDialog({ isOpen, onOpenChange, conflict, onUseLocal, onUseServer, onMerge, onRetry, onIgnore, }: NavigationConflictDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
