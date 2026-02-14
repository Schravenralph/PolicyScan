/**
 * WizardSessionEngine - Orchestrates wizard navigation, session management, and step execution
 * 
 * This engine coordinates wizard actions and triggers workflow runs as needed,
 * while maintaining separation from the workflow engine's execution semantics.
 * 
 * Responsibilities:
 * - Create/load sessions
 * - Validate navigation (prereqs + canGoBack/canJumpTo)
 * - Execute step actions (Phase 2 - skeleton for now)
 * - Mark step completion
 * - Expose deterministic wizard session state for E2E assertions
 */

import { randomUUID } from 'crypto';
import { WizardSessionService } from './WizardSessionService.js';
import { getActionRegistry } from './steps/index.js';
import {
  RevisionConflictError,
  WizardPrerequisiteError,
  WizardNavigationError,
} from '../../models/WizardSession.js';
import type { WizardSessionDocument } from '../../types/WizardSession.js';
import type { WizardStepDefinition } from './WizardStepDefinition.js';
import type { WizardResult, StepResult } from '../../types/WizardResult.js';
import { BadRequestError, NotFoundError, ServiceUnavailableError } from '../../types/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Navigation history entry
 */
export interface NavigationHistoryEntry {
  stepId: string;
  timestamp: string;
  direction: 'forward' | 'back' | 'jump';
}

/**
 * Wizard state for deterministic E2E testing
 */
export interface WizardState {
  sessionId: string;
  wizardDefinition: { id: string; version: number };
  currentStepId: string;
  completedSteps: string[];
  status: string;
  context: Record<string, unknown>;
  navigationHistory: NavigationHistoryEntry[];
  linkedQueryId?: string;
  linkedRunId?: string;
  revision: number;
  updatedAt: string;
}

/**
 * Wizard definition registry interface
 * This will be implemented by WI-109 (BeleidsscanWizardDefinition)
 */
export interface WizardDefinition {
  id: string;
  version: number;
  steps: WizardStepDefinition[];
}

/**
 * In-memory registry for wizard definitions
 * 
 * Stores wizard definitions by ID and version, allowing retrieval of specific versions
 * or the latest version when no version is specified. Definitions are registered via
 * WizardSessionEngine.registerWizardDefinition() at server startup.
 * 
 * WI-109 (BeleidsscanWizardDefinition) uses this registry to store wizard definitions.
 */
class WizardDefinitionRegistry {
  private definitions: Map<string, Map<number, WizardDefinition>> = new Map();

  /**
   * Register a wizard definition
   */
  register(definition: WizardDefinition): void {
    if (!this.definitions.has(definition.id)) {
      this.definitions.set(definition.id, new Map());
    }
    const versions = this.definitions.get(definition.id)!;
    versions.set(definition.version, definition);
  }

  /**
   * Get a wizard definition by ID and version
   */
  get(definitionId: string, version?: number): WizardDefinition | null {
    const versions = this.definitions.get(definitionId);
    if (!versions) {
      return null;
    }

    if (version !== undefined) {
      return versions.get(version) || null;
    }

    // Return latest version if no version specified
    const versionNumbers = Array.from(versions.keys()).sort((a, b) => b - a);
    if (versionNumbers.length === 0) {
      return null;
    }
    return versions.get(versionNumbers[0]) || null;
  }

  /**
   * Get a step definition from a wizard definition
   */
  getStepDefinition(
    definitionId: string,
    stepId: string,
    version?: number
  ): WizardStepDefinition | null {
    const definition = this.get(definitionId, version);
    if (!definition) {
      return null;
    }
    return definition.steps.find((step) => step.id === stepId) || null;
  }
}

// Global registry instance
const wizardDefinitionRegistry = new WizardDefinitionRegistry();

/**
 * WizardSessionEngine - Main orchestration engine for wizard sessions
 */
export class WizardSessionEngine {
  /**
   * Register a wizard definition
   * 
   * Called at server startup to register wizard definitions (e.g., BeleidsscanWizardDefinition from WI-109).
   * Definitions are stored in the registry and can be retrieved by ID and version.
   */
  static registerWizardDefinition(definition: WizardDefinition): void {
    wizardDefinitionRegistry.register(definition);
  }

  /**
   * Create a new wizard session
   * 
   * @param definitionId - The wizard definition ID (e.g., 'beleidsscan-wizard')
   * @param version - Optional version number (defaults to latest)
   * @param userId - Optional user ID to store in session context for configuration access
   * @returns The created wizard session
   */
  static async createSession(
    definitionId: string,
    version?: number,
    userId?: string
  ): Promise<WizardSessionDocument> {
    // Get wizard definition to validate it exists
    const definition = wizardDefinitionRegistry.get(definitionId, version);
    if (!definition) {
      throw new NotFoundError('Wizard definition', `${definitionId}${version ? ` (version ${version})` : ''}`, {
        wizardDefinitionId: definitionId,
        wizardDefinitionVersion: version,
      });
    }

    // Generate session ID
    const sessionId = `wizard_${Date.now()}_${randomUUID()}`;

    // Get first step from definition
    const firstStep = definition.steps[0];
    if (!firstStep) {
      throw new ServiceUnavailableError(`Wizard definition has no steps: ${definitionId}`, {
        definitionId,
        version: definition.version,
        reason: 'invalid_wizard_definition'
      });
    }

    // Initialize navigation history
    const navigationHistory: NavigationHistoryEntry[] = [
      {
        stepId: firstStep.id,
        timestamp: new Date().toISOString(),
        direction: 'forward',
      },
    ];

    // Create session with userId in context if provided
    const session = await WizardSessionService.createSession({
      sessionId,
      wizardDefinitionId: definitionId,
      wizardDefinitionVersion: version || definition.version,
      currentStepId: firstStep.id as WizardSessionDocument['currentStepId'],
      completedSteps: [],
      context: {
        navigationHistory,
        ...(userId ? { userId } : {}),
      },
      status: 'active',
    });

    return session;
  }

  /**
   * Get a wizard session by sessionId
   * 
   * @param sessionId - The session ID
   * @returns The wizard session or null if not found
   */
  static async getSession(sessionId: string): Promise<WizardSessionDocument | null> {
    return await WizardSessionService.getSession(sessionId);
  }

  /**
   * Validate navigation to a target step
   * 
   * Checks:
   * - Prerequisites are met
   * - Navigation rules allow the transition (canGoBack/canJumpTo)
   * 
   * @param sessionId - The session ID
   * @param targetStepId - The target step ID to navigate to
   * @throws Error if navigation is not valid
   */
  static async validateNavigation(
    sessionId: string,
    targetStepId: string
  ): Promise<void> {
    const session = await WizardSessionService.getSessionOrThrow(sessionId);

    // Get wizard definition
    const definition = wizardDefinitionRegistry.get(
      session.wizardDefinitionId,
      session.wizardDefinitionVersion
    );
    if (!definition) {
      throw new NotFoundError('Wizard definition', `${session.wizardDefinitionId} (version ${session.wizardDefinitionVersion})`, {
        wizardDefinitionId: session.wizardDefinitionId,
        wizardDefinitionVersion: session.wizardDefinitionVersion,
      });
    }

    // Get target step definition
    const targetStep = definition.steps.find((step) => step.id === targetStepId);
    if (!targetStep) {
      throw new BadRequestError(`Step not found: ${targetStepId}`, {
        stepId: targetStepId,
        wizardDefinitionId: session.wizardDefinitionId,
      });
    }

    // Get current step definition
    const currentStep = definition.steps.find((step) => step.id === session.currentStepId);
    if (!currentStep) {
      throw new BadRequestError(`Current step not found: ${session.currentStepId}`, {
        stepId: session.currentStepId,
        wizardDefinitionId: session.wizardDefinitionId,
      });
    }

    // Check if navigating to the same step
    if (targetStepId === session.currentStepId) {
      return; // Already on this step, no validation needed
    }

    // Determine navigation direction
    const currentStepIndex = definition.steps.findIndex((step) => step.id === session.currentStepId);
    const targetStepIndex = definition.steps.findIndex((step) => step.id === targetStepId);
    const isGoingBack = targetStepIndex < currentStepIndex;
    const isJumping = Math.abs(targetStepIndex - currentStepIndex) > 1;

    // Check prerequisites (unless jumping and canJumpTo is true)
    if (!isJumping || !targetStep.navigation.canJumpTo) {
      const unmetPrerequisites: string[] = [];
      const unmetPrerequisiteNames: string[] = [];

      for (const prerequisiteId of targetStep.prerequisites) {
        if (!session.completedSteps.includes(prerequisiteId)) {
          unmetPrerequisites.push(prerequisiteId);
          // Get step name for better error message
          const prerequisiteStep = definition.steps.find(step => step.id === prerequisiteId);
          if (prerequisiteStep) {
            unmetPrerequisiteNames.push(prerequisiteStep.name);
          } else {
            unmetPrerequisiteNames.push(prerequisiteId);
          }
        }
      }

      if (unmetPrerequisites.length > 0) {
        const targetStepName = targetStep.name || targetStepId;
        const prerequisiteList = unmetPrerequisiteNames.join(', ');

        // Create user-friendly Dutch error message
        const errorMessage = unmetPrerequisites.length === 1
          ? `Je moet eerst "${prerequisiteList}" voltooien voordat je naar "${targetStepName}" kunt gaan.`
          : `Je moet eerst de volgende stappen voltooien voordat je naar "${targetStepName}" kunt gaan: ${prerequisiteList}`;

        // Throw structured error
        throw new WizardPrerequisiteError(errorMessage, {
          type: 'prerequisite_not_met',
          targetStepId,
          targetStepName,
          missingPrerequisites: unmetPrerequisites,
          missingPrerequisiteNames: unmetPrerequisiteNames,
          completedSteps: session.completedSteps,
          currentStepId: session.currentStepId,
          suggestion: `Voltooi eerst ${unmetPrerequisites.length === 1 ? 'de stap' : 'de stappen'}: ${prerequisiteList}`,
        });
      }
    }

    // Check navigation rules
    if (isGoingBack) {
      if (!currentStep.navigation.canGoBack) {
        throw new WizardNavigationError(
          `Cannot go back from "${currentStep.name || session.currentStepId}". This step does not allow backward navigation.`,
          {
            currentStepId: session.currentStepId,
            targetStepId,
            canGoBack: false,
          }
        );
      }
    } else if (isJumping) {
      if (!targetStep.navigation.canJumpTo) {
        const targetStepName = targetStep.name || targetStepId;
        throw new WizardNavigationError(
          `Cannot jump to "${targetStepName}". Please complete the previous steps in order.`,
          {
            currentStepId: session.currentStepId,
            targetStepId,
            canJumpTo: false,
          }
        );
      }
    }
  }

  /**
   * Navigate to a target step
   * 
   * Validates navigation and updates the session with the new current step.
   * Tracks navigation history for debugging.
   * 
   * @param sessionId - The session ID
   * @param targetStepId - The target step ID to navigate to
   * @returns The updated wizard session
   */
  static async navigate(
    sessionId: string,
    targetStepId: string
  ): Promise<WizardSessionDocument> {
    // Validate navigation first
    await this.validateNavigation(sessionId, targetStepId);

    const session = await WizardSessionService.getSessionOrThrow(sessionId);

    // Get wizard definition to determine navigation direction
    const definition = wizardDefinitionRegistry.get(
      session.wizardDefinitionId,
      session.wizardDefinitionVersion
    );
    if (!definition) {
      throw new NotFoundError('Wizard definition', `${session.wizardDefinitionId} (version ${session.wizardDefinitionVersion})`, {
        wizardDefinitionId: session.wizardDefinitionId,
        wizardDefinitionVersion: session.wizardDefinitionVersion,
      });
    }

    const currentStepIndex = definition.steps.findIndex((step) => step.id === session.currentStepId);
    const targetStepIndex = definition.steps.findIndex((step) => step.id === targetStepId);
    const isGoingBack = targetStepIndex < currentStepIndex;
    const isJumping = Math.abs(targetStepIndex - currentStepIndex) > 1;

    // Determine navigation direction
    const direction: 'forward' | 'back' | 'jump' = isJumping
      ? 'jump'
      : isGoingBack
        ? 'back'
        : 'forward';

    // Get existing navigation history from context and create a copy to avoid mutation
    const existingHistory = (session.context.navigationHistory as NavigationHistoryEntry[]) || [];
    const navigationHistory = [...existingHistory];

    // Add new navigation entry
    navigationHistory.push({
      stepId: targetStepId,
      timestamp: new Date().toISOString(),
      direction,
    });

    // Update session
    const updatedSession = await WizardSessionService.updateSession(sessionId, {
      currentStepId: targetStepId as WizardSessionDocument['currentStepId'],
      context: {
        ...session.context,
        navigationHistory,
      },
      revision: session.revision,
    });

    return updatedSession;
  }

  /**
   * Execute a step action
   * 
   * Executes a wizard step action via the action registry and applies context updates.
   * Supports optimistic locking via revision parameter.
   * 
   * @param sessionId - The session ID
   * @param stepId - The step ID
   * @param actionId - The action ID to execute
   * @param input - The action input
   * @param revision - Optional revision number for optimistic locking (throws RevisionConflictError on mismatch)
   * @returns The action output
   */
  static async executeStep(
    sessionId: string,
    stepId: string,
    actionId: string,
    input: unknown,
    revision?: number
  ): Promise<unknown> {
    const session = await WizardSessionService.getSessionOrThrow(sessionId);

    // Check revision for optimistic locking if provided
    if (revision !== undefined && revision !== session.revision) {
      throw new RevisionConflictError(sessionId, revision, session.revision);
    }

    // Validate that we're on the correct step
    if (session.currentStepId !== stepId) {
      throw new BadRequestError(
        `Cannot execute action for step ${stepId}: current step is ${session.currentStepId}`,
        {
          sessionId,
          requestedStepId: stepId,
          currentStepId: session.currentStepId,
          actionId
        }
      );
    }

    // Get wizard definition
    const definition = wizardDefinitionRegistry.get(
      session.wizardDefinitionId,
      session.wizardDefinitionVersion
    );
    if (!definition) {
      throw new NotFoundError('Wizard definition', `${session.wizardDefinitionId} (version ${session.wizardDefinitionVersion})`, {
        wizardDefinitionId: session.wizardDefinitionId,
        wizardDefinitionVersion: session.wizardDefinitionVersion,
      });
    }

    // Get step definition
    const stepDefinition = definition.steps.find((step) => step.id === stepId);
    if (!stepDefinition) {
      throw new BadRequestError(`Step not found: ${stepId}`, {
        stepId,
        wizardDefinitionId: session.wizardDefinitionId,
      });
    }

    // Validate input using step definition schema
    try {
      stepDefinition.inputSchema.parse(input);
    } catch (error) {
      throw new BadRequestError(`Invalid input for step ${stepId}`, {
        stepId,
        wizardDefinitionId: session.wizardDefinitionId,
        validationError: error instanceof Error ? error.message : String(error),
      });
    }

    // Get action from registry
    const actionRegistry = getActionRegistry();
    const action = actionRegistry.getAction(stepId, actionId);

    if (!action) {
      throw new NotFoundError('Wizard action', `${stepId}.${actionId}`, {
        sessionId,
        stepId,
        actionId,
        wizardDefinitionId: session.wizardDefinitionId,
        reason: 'action_not_registered'
      });
    }

    // Execute the action
    const output = await action.execute(session, input);

    // Validate output using step definition schema
    try {
      stepDefinition.outputSchema.parse(output);
    } catch (error) {
      throw new BadRequestError(`Invalid output from action ${stepId}.${actionId}`, {
        stepId,
        actionId,
        wizardDefinitionId: session.wizardDefinitionId,
        validationError: error instanceof Error ? error.message : String(error),
      });
    }

    // Apply context updates if present
    if (output && typeof output === 'object' && 'contextUpdates' in output) {
      const contextUpdates = (output as { contextUpdates?: Record<string, unknown> }).contextUpdates;
      if (contextUpdates && typeof contextUpdates === 'object') {
        // Update session context with the updates
        const updatedContext = {
          ...session.context,
          ...contextUpdates,
        };

        // Update session context with retry logic for revision conflicts
        // Retry up to 3 times with exponential backoff
        let retries = 3;
        let lastError: Error | null = null;
        
        while (retries > 0) {
          try {
            // Reload session to get latest revision before updating context
            // This prevents revision conflicts from concurrent updates
            const latestSession = await WizardSessionService.getSessionOrThrow(sessionId);
            
            // Also update linkedRunId if present in contextUpdates
            if ('runId' in contextUpdates && typeof contextUpdates.runId === 'string') {
              await WizardSessionService.updateSession(sessionId, {
                context: updatedContext,
                linkedRunId: contextUpdates.runId,
                revision: latestSession.revision, // Use latest revision for optimistic locking
              });
            } else {
              await WizardSessionService.updateSession(sessionId, {
                context: updatedContext,
                revision: latestSession.revision, // Use latest revision for optimistic locking
              });
            }
            
            // Success - break out of retry loop
            break;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Check if it's a revision conflict error (may be wrapped in DatabaseQueryError)
            const isRevisionConflict = 
              error instanceof RevisionConflictError ||
              (error && typeof error === 'object' && 'originalError' in error && 
               error.originalError instanceof RevisionConflictError) ||
              (error instanceof Error && error.message.includes('Revision conflict'));
            
            // Check if it's a database connection error (server restart, connection lost, etc.)
            const isConnectionError = 
              error instanceof Error && (
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('connection') ||
                error.message.includes('MongoNetworkError') ||
                error.message.includes('MongoServerSelectionError') ||
                error.name === 'MongoNetworkError' ||
                error.name === 'MongoServerSelectionError'
              );
            
            if (isRevisionConflict) {
              retries--;
              if (retries > 0) {
                // Exponential backoff: 10ms, 20ms, 40ms
                const delay = 10 * Math.pow(2, 3 - retries);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue; // Retry
              }
            } else if (isConnectionError && retries > 0) {
              // Retry on connection errors (server restart, network issues)
              retries--;
              logger.warn(
                { sessionId, error: lastError.message, retriesLeft: retries },
                'Database connection error during context update, retrying...'
              );
              // Longer delay for connection errors (server may be restarting)
              const delay = 500 * Math.pow(2, 3 - retries); // 500ms, 1000ms, 2000ms
              await new Promise(resolve => setTimeout(resolve, delay));
              continue; // Retry
            }
            
            // Not a retryable error or out of retries - throw the error
            throw error;
          }
        }
        
        // If we exhausted retries, throw the last error
        if (lastError) {
          throw lastError;
        }

        // After updating context, check if step completion criteria are met
        // and automatically mark the step as completed if so
        const updatedSession = await WizardSessionService.getSessionOrThrow(sessionId);
        if (stepDefinition.completionCriteria && stepDefinition.completionCriteria(updatedSession)) {
          // Step completion criteria are met, mark the step as completed
          // Only mark if not already completed to avoid unnecessary updates
          if (!updatedSession.completedSteps.includes(stepId)) {
            // Pass the latest revision to prevent conflicts
            await WizardSessionEngine.markStepCompleted(sessionId, stepId, output, updatedSession.revision);
          }
        }
      }
    }

    return output;
  }

  /**
   * Validate input for a step
   * 
   * Validates input against the step definition's input schema.
   * 
   * @param sessionId - The session ID
   * @param stepId - The step ID to validate input for
   * @param input - The input to validate
   * @throws Error if validation fails
   */
  static async validateStepInput(
    sessionId: string,
    stepId: string,
    input: unknown
  ): Promise<void> {
    const session = await WizardSessionService.getSessionOrThrow(sessionId);

    // Get wizard definition
    const definition = wizardDefinitionRegistry.get(
      session.wizardDefinitionId,
      session.wizardDefinitionVersion
    );
    if (!definition) {
      throw new NotFoundError('Wizard definition', `${session.wizardDefinitionId} (version ${session.wizardDefinitionVersion})`, {
        wizardDefinitionId: session.wizardDefinitionId,
        wizardDefinitionVersion: session.wizardDefinitionVersion,
      });
    }

    // Get step definition
    const stepDefinition = definition.steps.find((step) => step.id === stepId);
    if (!stepDefinition) {
      throw new BadRequestError(`Step not found: ${stepId}`, {
        stepId,
        wizardDefinitionId: session.wizardDefinitionId,
      });
    }

    // Validate input using step definition schema
    stepDefinition.inputSchema.parse(input);
  }

  /**
   * Mark a step as completed
   * 
   * Updates the session to mark the step as completed and stores the output.
   * 
   * @param sessionId - The session ID
   * @param stepId - The step ID to mark as completed
   * @param output - The step output
   * @param revision - Optional revision for optimistic locking (if not provided, uses current session revision)
   */
  static async markStepCompleted(
    sessionId: string,
    stepId: string,
    output: unknown,
    revision?: number
  ): Promise<void> {
    const session = await WizardSessionService.getSessionOrThrow(sessionId);

    // Get wizard definition
    const definition = wizardDefinitionRegistry.get(
      session.wizardDefinitionId,
      session.wizardDefinitionVersion
    );
    if (!definition) {
      throw new NotFoundError('Wizard definition', `${session.wizardDefinitionId} (version ${session.wizardDefinitionVersion})`, {
        wizardDefinitionId: session.wizardDefinitionId,
        wizardDefinitionVersion: session.wizardDefinitionVersion,
      });
    }

    // Get step definition
    const stepDefinition = definition.steps.find((step) => step.id === stepId);
    if (!stepDefinition) {
      throw new BadRequestError(`Step not found: ${stepId}`, {
        stepId,
        wizardDefinitionId: session.wizardDefinitionId,
      });
    }

    // Validate output using step definition schema
    try {
      stepDefinition.outputSchema.parse(output);
    } catch (error) {
      // Provide more detailed error message for debugging
      const errorDetails = error instanceof Error ? error.message : String(error);
      const outputType = Array.isArray(output) ? 'array' : output === null ? 'null' : output === undefined ? 'undefined' : typeof output;
      const outputPreview = outputType === 'object' && output !== null
        ? JSON.stringify(output).substring(0, 200)
        : String(output);

      throw new BadRequestError(
        `Invalid output for step ${stepId}: ${errorDetails}. ` +
        `Output type: ${outputType}, preview: ${outputPreview}`
      );
    }

    // Check if step is already completed
    if (session.completedSteps.includes(stepId)) {
      return; // Already completed, no-op
    }

    // Add step to completed steps
    const completedSteps = [...session.completedSteps, stepId];

    // Store output in context
    const context = {
      ...session.context,
      [`step_${stepId}_output`]: output,
    };

    // Update session with provided revision or current session revision
    await WizardSessionService.updateSession(sessionId, {
      completedSteps,
      context,
      revision: revision ?? session.revision,
    });
  }

  /**
   * Get deterministic state for E2E testing
   * 
   * Returns a stable, deterministic representation of the wizard session state
   * that can be used for E2E test assertions.
   * 
   * @param sessionId - The session ID
   * @returns The deterministic wizard state
   */
  static async getDeterministicState(sessionId: string): Promise<WizardState> {
    const session = await WizardSessionService.getSessionOrThrow(sessionId);

    // Get navigation history from context
    const navigationHistory: NavigationHistoryEntry[] =
      (session.context.navigationHistory as NavigationHistoryEntry[]) || [];

    return {
      sessionId: session.sessionId,
      wizardDefinition: {
        id: session.wizardDefinitionId,
        version: session.wizardDefinitionVersion,
      },
      currentStepId: session.currentStepId,
      completedSteps: [...session.completedSteps],
      status: session.status,
      context: { ...session.context },
      navigationHistory: [...navigationHistory],
      linkedQueryId: session.linkedQueryId?.toString(),
      linkedRunId: session.linkedRunId,
      revision: session.revision,
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  /**
   * Compose WizardResult from wizard session
   * 
   * Aggregates wizard session state, step results, and linked query/run information
   * into a canonical WizardResult object that can be consumed by frontend and
   * downstream systems.
   * 
   * @param sessionId - The session ID
   * @returns The composed WizardResult
   */
  static async composeWizardResult(sessionId: string): Promise<WizardResult> {
    const session = await WizardSessionService.getSessionOrThrow(sessionId);

    // Get wizard definition
    const definition = wizardDefinitionRegistry.get(
      session.wizardDefinitionId,
      session.wizardDefinitionVersion
    );
    if (!definition) {
      throw new NotFoundError('Wizard definition', `${session.wizardDefinitionId} (version ${session.wizardDefinitionVersion})`, {
        wizardDefinitionId: session.wizardDefinitionId,
        wizardDefinitionVersion: session.wizardDefinitionVersion,
      });
    }

    // Build step results array
    const stepResults: StepResult[] = definition.steps.map((step) => {
      const isCompleted = session.completedSteps.includes(step.id);
      const stepOutput = session.context[`step_${step.id}_output`] as Record<string, unknown> | undefined;

      // Determine step status
      let status: StepResult['status'] = 'pending';
      if (isCompleted) {
        status = 'completed';
      } else if (session.status === 'failed' && session.currentStepId === step.id) {
        status = 'failed';
      }

      // Get completion time from context if available
      const completedAt = stepOutput?.completedAt
        ? (stepOutput.completedAt instanceof Date ? stepOutput.completedAt : new Date(stepOutput.completedAt as string))
        : undefined;

      return {
        stepId: step.id,
        stepName: step.name,
        status,
        completedAt,
        output: stepOutput,
      };
    });

    // Calculate summary
    const totalSteps = definition.steps.length;
    const completedSteps = session.completedSteps.length;
    const currentStepId = session.currentStepId;
    const status: WizardResult['summary']['status'] = session.status;

    // Build summary
    const summary: WizardResult['summary'] = {
      totalSteps,
      completedSteps,
      currentStepId,
      status,
    };

    // Get linked IDs
    const linkedQueryId = session.linkedQueryId?.toString();
    const linkedRunId = session.linkedRunId;

    // Build final context (copy of session context)
    const finalContext: Record<string, unknown> = { ...session.context };

    // Compose and return WizardResult
    return {
      sessionId: session.sessionId,
      wizard: {
        id: session.wizardDefinitionId,
        version: session.wizardDefinitionVersion,
      },
      summary,
      stepResults,
      linkedQueryId,
      linkedRunId,
      finalContext,
    };
  }
}

