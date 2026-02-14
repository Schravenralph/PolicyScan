/**
 * useWizardSession Hook
 * 
 * Manages wizard session state and provides methods for session operations.
 */

import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { WizardSession, WizardState, WizardResult } from '../services/api/WizardApiService';
import { logError } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import { withRevisionConflictRetry } from '../utils/revisionRetry';

export interface UseWizardSessionReturn {
  session: WizardSession | null;
  sessionId: string | null;
  isLoading: boolean;
  error: Error | null;
  createSession: (wizardDefinitionId: string, wizardDefinitionVersion?: number) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  navigate: (targetStepId: string) => Promise<WizardSession>;
  validateInput: (stepId: string, input: unknown) => Promise<boolean>;
  executeAction: (stepId: string, actionId: string, input: unknown) => Promise<unknown>;
  markStepCompleted: (stepId: string, output: unknown) => Promise<void>;
  getState: () => Promise<WizardState | null>;
  getResult: () => Promise<WizardResult | null>;
  clearError: () => void;
}

/**
 * Custom hook for wizard session management
 */
export function useWizardSession(): UseWizardSessionReturn {
  const [session, setSession] = useState<WizardSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionRef = useRef<WizardSession | null>(null);
  
  // Keep ref in sync with state
  if (session !== sessionRef.current) {
    sessionRef.current = session;
  }

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createSession = useCallback(
    async (wizardDefinitionId: string, wizardDefinitionVersion?: number): Promise<string> => {
      setIsLoading(true);
      setError(null);
      try {
        const newSession = await api.wizard.createSession({
          wizardDefinitionId,
          wizardDefinitionVersion,
        });
        setSession(newSession);
        sessionRef.current = newSession;
        sessionIdRef.current = newSession.sessionId;
        return newSession.sessionId;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create wizard session');
        setError(error);
        logError(error, 'create-wizard-session');
        toast.error('Fout bij aanmaken wizard sessie', error.message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const loadSession = useCallback(async (sessionId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // Get session state (which includes session data)
      const state = await api.wizard.getSessionState(sessionId);
      // Convert state to session format
      const sessionData: WizardSession = {
        sessionId: state.sessionId,
        wizardDefinitionId: state.wizardDefinition.id,
        wizardDefinitionVersion: state.wizardDefinition.version,
        currentStepId: state.currentStepId,
        completedSteps: state.completedSteps,
        status: state.status as 'active' | 'completed' | 'failed' | 'abandoned',
        context: state.context,
        revision: state.revision,
        createdAt: new Date().toISOString(), // State doesn't include timestamps
        updatedAt: new Date().toISOString(),
      };
      setSession(sessionData);
      sessionRef.current = sessionData;
      sessionIdRef.current = sessionId;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load wizard session');
      setError(error);
      logError(error, 'load-wizard-session');
      toast.error('Fout bij laden wizard sessie', error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const navigate = useCallback(
    async (targetStepId: string): Promise<WizardSession> => {
      if (!session) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);
      try {
        const updatedSession = await withRevisionConflictRetry(
          (getCurrentRevision) => {
            const currentRevision = getCurrentRevision();
            if (currentRevision === undefined) {
              throw new Error('Session revision not available');
            }
            const currentSession = sessionRef.current;
            if (!currentSession) {
              throw new Error('No active session');
            }
            return api.wizard.navigate(currentSession.sessionId, {
              targetStepId,
              revision: currentRevision,
            });
          },
          async () => {
            if (session.sessionId) {
              await loadSession(session.sessionId);
              return sessionRef.current?.revision;
            }
            return undefined;
          },
          () => sessionRef.current?.revision,
          3
        );
        setSession(updatedSession);
        sessionRef.current = updatedSession;
        return updatedSession;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to navigate');
        setError(error);
        logError(error, 'wizard-navigate');
        toast.error('Fout bij navigeren', error.message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [session, loadSession]
  );

  const validateInput = useCallback(
    async (stepId: string, input: unknown): Promise<boolean> => {
      if (!session) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await withRevisionConflictRetry(
          (getCurrentRevision) => {
            const currentRevision = getCurrentRevision();
            if (currentRevision === undefined) {
              throw new Error('Session revision not available');
            }
            const currentSession = sessionRef.current;
            if (!currentSession) {
              throw new Error('No active session');
            }
            return api.wizard.validateInput(currentSession.sessionId, stepId, {
              input,
              revision: currentRevision,
            });
          },
          async () => {
            if (session.sessionId) {
              await loadSession(session.sessionId);
              return sessionRef.current?.revision;
            }
            return undefined;
          },
          () => sessionRef.current?.revision,
          3
        );
        return response.valid;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to validate input');
        setError(error);
        logError(error, 'wizard-validate-input');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [session, loadSession]
  );

  const executeAction = useCallback(
    async (stepId: string, actionId: string, input: unknown): Promise<unknown> => {
      if (!session) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);
      try {
        // Refresh session before first attempt to ensure we have the latest revision
        await loadSession(session.sessionId);
        
        const response = await withRevisionConflictRetry(
          (getCurrentRevision) => {
            const currentRevision = getCurrentRevision();
            if (currentRevision === undefined) {
              throw new Error('Session revision not available');
            }
            const currentSession = sessionRef.current;
            if (!currentSession) {
              throw new Error('No active session');
            }
            return api.wizard.executeAction(currentSession.sessionId, stepId, actionId, {
              input,
              revision: currentRevision,
            });
          },
          async () => {
            if (session.sessionId) {
              await loadSession(session.sessionId);
              return sessionRef.current?.revision;
            }
            return undefined;
          },
          () => sessionRef.current?.revision,
          3
        );

        // Update session if context was updated
        if (response.contextUpdates) {
          // Refresh session to get updated state
          await loadSession(session.sessionId);
        }

        return response.output;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to execute action');
        setError(error);
        logError(error, 'wizard-execute-action');
        toast.error('Fout bij uitvoeren actie', error.message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [session, loadSession]
  );

  const markStepCompleted = useCallback(
    async (stepId: string, output: unknown): Promise<void> => {
      if (!session) {
        throw new Error('No active session');
      }

      setIsLoading(true);
      setError(null);
      try {
        const updatedSession = await withRevisionConflictRetry(
          (getCurrentRevision) => {
            const currentRevision = getCurrentRevision();
            if (currentRevision === undefined) {
              throw new Error('Session revision not available');
            }
            const currentSession = sessionRef.current;
            if (!currentSession) {
              throw new Error('No active session');
            }
            return api.wizard.markStepCompleted(
              currentSession.sessionId,
              stepId,
              output,
              currentRevision
            );
          },
          async () => {
            if (session.sessionId) {
              await loadSession(session.sessionId);
              return sessionRef.current?.revision;
            }
            return undefined;
          },
          () => sessionRef.current?.revision,
          3
        );
        setSession(updatedSession);
        sessionRef.current = updatedSession;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to mark step as completed');
        setError(error);
        logError(error, 'wizard-mark-step-completed');
        toast.error('Fout bij voltooien stap', error.message);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [session, loadSession]
  );

  const getState = useCallback(async (): Promise<WizardState | null> => {
    if (!session) {
      return null;
    }

    try {
      return await api.wizard.getSessionState(session.sessionId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to get session state');
      logError(error, 'wizard-get-state');
      return null;
    }
  }, [session]);

  const getResult = useCallback(async (): Promise<WizardResult | null> => {
    if (!session) {
      return null;
    }

    try {
      return await api.wizard.getResult(session.sessionId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to get wizard result');
      logError(error, 'wizard-get-result');
      return null;
    }
  }, [session]);

  return {
    session,
    sessionId: sessionIdRef.current,
    isLoading,
    error,
    createSession,
    loadSession,
    navigate,
    validateInput,
    executeAction,
    markStepCompleted,
    getState,
    getResult,
    clearError,
  };
}

