/**
 * Hook for managing wizard session initialization in Beleidsscan component
 * Extracted from Beleidsscan component to reduce component size
 */

import { useEffect, useRef } from 'react';
import { toast } from '../utils/toast';
import { logError } from '../utils/errorHandler';

interface UseWizardSessionInitializationProps {
  isLoadingWorkflowConfig: boolean;
  availableWorkflows: Array<{ id: string; name: string }>;
  workflowConfigError: Error | null;
  activeWorkflowId: string | undefined;
  createWizardSession: (wizardDefinitionId: string, wizardDefinitionVersion?: number) => Promise<string>;
  loadDraftFromStorage: () => { queryId?: string | null } | null;
  sessionCreatedRef: React.MutableRefObject<boolean>;
}

/**
 * Hook for managing wizard session initialization
 * Handles session creation on mount and workflow configuration change notifications
 */
export function useWizardSessionInitialization({
  isLoadingWorkflowConfig,
  availableWorkflows,
  workflowConfigError,
  activeWorkflowId,
  createWizardSession,
  loadDraftFromStorage,
  sessionCreatedRef,
}: UseWizardSessionInitializationProps) {
  const previousWorkflowIdRef = useRef<string | undefined>(undefined);

  /**
   * Initialize wizard session on mount
   */
  useEffect(() => {
    // Skip if already created or still loading
    if (sessionCreatedRef.current || isLoadingWorkflowConfig || workflowConfigError) {
      return;
    }

    const workflowId = activeWorkflowId;
    if (!workflowId) {
      return;
    }

    const initializeWizardSession = async () => {
      // Check if we have an existing draft to migrate
      const draft = loadDraftFromStorage();
      
      if (draft && draft.queryId) {
        // If we have a draft with a queryId, try to find or create a wizard session
        // For now, create a new session - migration logic can be added later
        try {
          await createWizardSession(workflowId, 1);
          sessionCreatedRef.current = true;
        } catch (error) {
          // If session creation fails, continue with draft-based flow
          logError(error instanceof Error ? error : new Error('Failed to create wizard session'), 'create-wizard-session-with-draft');
          toast.warning(
            'Sessie aanmaken mislukt',
            'Kon geen wizard sessie aanmaken. De draft wordt gebruikt.'
          );
        }
      } else {
        // No draft, create a new wizard session
        try {
          await createWizardSession(workflowId, 1);
          sessionCreatedRef.current = true;
        } catch (error) {
          logError(error instanceof Error ? error : new Error('Failed to create wizard session'), 'create-wizard-session');
          toast.error(
            'Sessie aanmaken mislukt',
            'Kon geen wizard sessie aanmaken. Probeer de pagina te verversen.'
          );
        }
      }
    };

    initializeWizardSession();
  }, [isLoadingWorkflowConfig, availableWorkflows, workflowConfigError, activeWorkflowId, createWizardSession, loadDraftFromStorage, sessionCreatedRef]);

  /**
   * Notify user if workflow configuration changes during an active session
   */
  useEffect(() => {
    // Only check after initial session is created
    if (!sessionCreatedRef.current || isLoadingWorkflowConfig) {
      return;
    }

    const currentWorkflowId = activeWorkflowId;
    const previousWorkflowId = previousWorkflowIdRef.current;

    // If workflow changed and we have an active session, notify user
    if (previousWorkflowId !== undefined && currentWorkflowId !== previousWorkflowId && currentWorkflowId) {
      const workflow = availableWorkflows.find(w => w.id === currentWorkflowId);
      const workflowName = workflow?.name || currentWorkflowId;
      toast.info(
        'Workflow configuratie gewijzigd',
        `De actieve workflow configuratie is gewijzigd naar "${workflowName}". De huidige sessie blijft actief met de oorspronkelijke workflow.`
      );
    }

    // Update previous workflow ID
    previousWorkflowIdRef.current = currentWorkflowId;
  }, [activeWorkflowId, availableWorkflows, isLoadingWorkflowConfig, sessionCreatedRef]);
}



