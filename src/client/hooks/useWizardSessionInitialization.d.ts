/**
 * Hook for managing wizard session initialization in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */
interface UseWizardSessionInitializationProps {
    isLoadingWorkflowConfig: boolean;
    availableWorkflows: Array<{
        id: string;
        name: string;
    }>;
    workflowConfigError: Error | null;
    activeWorkflowId: string | undefined;
    createWizardSession: (wizardDefinitionId: string, wizardDefinitionVersion?: number) => Promise<string>;
    loadDraftFromStorage: () => {
        queryId?: string | null;
    } | null;
    sessionCreatedRef: React.MutableRefObject<boolean>;
}
/**
 * Hook for managing wizard session initialization
 * Handles session creation on mount and workflow configuration change notifications
 */
export declare function useWizardSessionInitialization({ isLoadingWorkflowConfig, availableWorkflows, workflowConfigError, activeWorkflowId, createWizardSession, loadDraftFromStorage, sessionCreatedRef, }: UseWizardSessionInitializationProps): void;
export {};
