/**
 * StartScanAction - Wizard step action for starting a document discovery scan
 * 
 * This action handles the `document-review` wizard step by:
 * - Validating that queryId is provided
 * - Checking for existing workflow runs (idempotent behavior)
 * - Starting a new workflow run if needed
 * - Linking the runId to the wizard session
 * - Updating the session context with runId deterministically
 * 
 * The action is idempotent:
 * - If an active run exists, it reuses it
 * - If a completed run exists, it reuses it unless forceNewRun is true
 * - Same input + same session state = same runId in context
 */

import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDB } from '../../../../config/database.js';
import { RunManager } from '../../../workflow/RunManager.js';
import { WorkflowEngine } from '../../../workflow/WorkflowEngine.js';
import { getWorkflowById } from '../../../../utils/workflowLookup.js';
import type { WizardStepAction } from '../WizardStepAction.js';
import type { WizardSessionDocument } from '../../../../types/WizardSession.js';
import { logger } from '../../../../utils/logger.js';
import { getActionExecutionService } from '../../ActionExecutionService.js';
import { generateActionId } from '../../../../utils/actionIdGenerator.js';
import { isE2EFixturesEnabled } from '../../../../config/featureFlags.js';
import { WorkflowConfigurationService } from '../../../workflow/WorkflowConfigurationService.js';
import { BadRequestError, NotFoundError } from '../../../../types/errors.js';

// Import schema from single source of truth
import { startScanInputSchema as schemaFromDefinition } from '../../definitions/schemas.js';

/**
 * Input schema for StartScanAction (re-exported from single source of truth)
 * @deprecated Use startScanInputSchema from definitions/schemas.ts instead
 */
export const startScanInputSchema = schemaFromDefinition;

/**
 * Input type for StartScanAction
 */
export type StartScanInput = z.infer<typeof startScanInputSchema>;

/**
 * Output type for StartScanAction
 */
export interface StartScanOutput {
  runId: string;
  status: string;
  isExistingRun?: boolean;
  actionId?: string;
  contextUpdates: {
    runId: string;
  };
}

/**
 * StartScanAction - Starts a workflow run for document discovery
 * 
 * This action implements the `startScan` action for the `document-review` step.
 * It triggers the beleidsscan-wizard workflow and handles idempotent behavior.
 */
export class StartScanAction implements WizardStepAction<StartScanInput, StartScanOutput> {
  readonly stepId = 'document-review';
  readonly actionId = 'startScan';

  /**
   * Execute the startScan action
   * 
   * This method:
   * 1. Validates input using the input schema
   * 2. Validates that queryId exists in session context
   * 3. Checks for existing runs (idempotent behavior)
   * 4. Starts a new workflow run if needed
   * 5. Returns the runId and status with context updates
   * 
   * @param session - The current wizard session
   * @param input - The action input (queryId, forceNewRun?)
   * @returns Promise resolving to the action output (runId, status, contextUpdates)
   * @throws Error if validation fails or workflow start fails
   */
  async execute(
    session: WizardSessionDocument,
    input: StartScanInput
  ): Promise<StartScanOutput> {
    // Validate input using schema
    const validatedInput = startScanInputSchema.parse(input);

    // Validate that queryId matches session context
    const sessionQueryId = session.context.queryId as string | undefined;
    if (!sessionQueryId) {
      throw new BadRequestError('Query ID not found in session context. Please complete query configuration step first.', {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }
    if (sessionQueryId !== validatedInput.queryId) {
      throw new BadRequestError(`Query ID mismatch: session has ${sessionQueryId}, but input provided ${validatedInput.queryId}`, {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId,
        sessionQueryId,
        inputQueryId: validatedInput.queryId
      });
    }

    // Get workflow from session's wizard definition ID (from user's active configuration)
    // Fallback to 'beleidsscan-wizard' for backward compatibility
    const workflowId = session.wizardDefinitionId || 'beleidsscan-wizard';
    const workflow = await getWorkflowById(workflowId);
    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId, {
        sessionId: session.sessionId,
        stepId: this.stepId,
        actionId: this.actionId
      });
    }
    
    logger.info(
      { workflowId, sessionId: session.sessionId, action: 'startScan' },
      'Using workflow from wizard definition'
    );

    // Initialize services
    const db = getDB();
    const runManager = new RunManager(db);
    const workflowEngine = new WorkflowEngine(runManager);
    
    // Initialize and register default workflow modules
    // This ensures modules like RankResults are available for workflows
    try {
      const { registerDefaultModules } = await import('../../../workflowModules/index.js');
      const { moduleRegistry } = await import('../../../workflow/WorkflowModuleRegistry.js');
      
      // Register default modules in the registry
      registerDefaultModules();
      
      // Register all modules from registry with workflow engine
      const allModules = moduleRegistry.getAll();
      for (const entry of allModules) {
        workflowEngine.registerModule(entry.metadata.id, entry.module);
      }
      logger.debug({ moduleCount: allModules.length }, 'Registered workflow modules');
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize workflow modules (non-fatal, but workflows using modules may fail)');
    }
    
    // Register all workflow actions (required for workflow execution)
    // This ensures the workflow engine has all necessary actions registered
    try {
      const { registerAllWorkflowActions } = await import('../../../workflow/registerWorkflowActions.js');
      // Try to get NavigationGraph if available (for save_scan_results action)
      let navigationGraph: any = undefined;
      try {
        const { getNeo4jDriver } = await import('../../../../config/neo4j.js');
        const { NavigationGraph } = await import('../../../graphs/navigation/NavigationGraph.js');
        const neo4jDriver = await getNeo4jDriver();
        if (neo4jDriver) {
          navigationGraph = new NavigationGraph(neo4jDriver);
        }
      } catch (error) {
        // NavigationGraph not available, continue without it
        logger.debug({ error }, 'NavigationGraph not available for action registration');
      }
      await registerAllWorkflowActions(workflowEngine, runManager, navigationGraph);
    } catch (error) {
      logger.warn({ error }, 'Failed to register workflow actions (non-fatal, but workflow may fail)');
    }
    
    const actionExecutionService = getActionExecutionService();

    // Check ActionExecutionService for existing action (idempotency check)
    if (!validatedInput.forceNewRun) {
      const existingAction = await actionExecutionService.checkIdempotency('startScan', {
        queryId: validatedInput.queryId,
        sessionId: session.sessionId,
      });

      if (existingAction) {
        // If action is completed or in progress, return existing run
        if (existingAction.status === 'completed' || existingAction.status === 'in_progress') {
          if (existingAction.workflowRunId) {
            const existingRun = await runManager.getRun(existingAction.workflowRunId);
            if (existingRun && ['pending', 'running', 'completed'].includes(existingRun.status)) {
              logger.info(
                { 
                  actionId: existingAction.actionId,
                  runId: existingAction.workflowRunId,
                  status: existingRun.status,
                  action: 'startScan'
                },
                'Returning existing action execution (idempotent via ActionExecutionService)'
              );
              return {
                runId: existingAction.workflowRunId,
                status: existingRun.status,
                isExistingRun: true,
                actionId: existingAction.actionId,
                contextUpdates: {
                  runId: existingAction.workflowRunId,
                },
              };
            }
          }
        }
      }
    }

    // Check for existing run via session.linkedRunId (fallback idempotent behavior)
    if (!validatedInput.forceNewRun && session.linkedRunId) {
      const existingRun = await runManager.getRun(session.linkedRunId);
      if (existingRun && ['pending', 'running', 'completed'].includes(existingRun.status)) {
        logger.info(
          { runId: session.linkedRunId, status: existingRun.status, action: 'startScan' },
          'Returning existing run (idempotent via session.linkedRunId)'
        );
        
        // Record or update action execution
        try {
          const actionId = generateActionId('startScan', {
            queryId: validatedInput.queryId,
            sessionId: session.sessionId,
          });
          const existingAction = await actionExecutionService.getAction(actionId);
          if (!existingAction) {
            await actionExecutionService.recordAction('startScan', {
              queryId: validatedInput.queryId,
              sessionId: session.sessionId,
            }, {
              workflowRunId: session.linkedRunId,
              status: existingRun.status === 'completed' ? 'completed' : 'in_progress',
            });
          }
        } catch (error) {
          logger.warn({ error }, 'Failed to record action execution (non-fatal)');
        }
        
        return {
          runId: session.linkedRunId,
          status: existingRun.status,
          isExistingRun: true,
          contextUpdates: {
            runId: session.linkedRunId,
          },
        };
      }
      // If run is failed/cancelled, we'll create a new one
    }

    // Check for existing runs by queryId (fallback idempotent behavior)
    const existingRuns = await runManager.getRunsByQueryId(validatedInput.queryId, 10);

    // Check for active runs first (pending or running)
    const activeRun = existingRuns.find(
      (run) => run.status === 'running' || run.status === 'pending'
    );

    if (activeRun && activeRun._id) {
      const existingRunId = activeRun._id.toString();
      logger.info(
        { queryId: validatedInput.queryId, existingRunId, action: 'startScan' },
        'Found existing active run, reusing it (idempotent behavior)'
      );

      // Record or update action execution
      try {
        const actionId = generateActionId('startScan', {
          queryId: validatedInput.queryId,
          sessionId: session.sessionId,
        });
        const existingAction = await actionExecutionService.getAction(actionId);
        if (!existingAction) {
          await actionExecutionService.recordAction('startScan', {
            queryId: validatedInput.queryId,
            sessionId: session.sessionId,
          }, {
            workflowRunId: existingRunId,
            status: 'in_progress',
          });
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to record action execution (non-fatal)');
      }

      return {
        runId: existingRunId,
        status: activeRun.status,
        isExistingRun: true,
        contextUpdates: {
          runId: existingRunId,
        },
      };
    }

    // Check for completed runs if forceNewRun is false
    if (!validatedInput.forceNewRun) {
      const completedRun = existingRuns.find((run) => run.status === 'completed');
      if (completedRun && completedRun._id) {
        const existingRunId = completedRun._id.toString();
        logger.info(
          { queryId: validatedInput.queryId, existingRunId, action: 'startScan' },
          'Found existing completed run, reusing it (idempotent behavior, forceNewRun=false)'
        );

        // Record or update action execution
        try {
          const actionId = generateActionId('startScan', {
            queryId: validatedInput.queryId,
            sessionId: session.sessionId,
          });
          const existingAction = await actionExecutionService.getAction(actionId);
          if (!existingAction) {
            await actionExecutionService.recordAction('startScan', {
              queryId: validatedInput.queryId,
              sessionId: session.sessionId,
            }, {
              workflowRunId: existingRunId,
              status: 'completed',
            });
          }
        } catch (error) {
          logger.warn({ error }, 'Failed to record action execution (non-fatal)');
        }

        return {
          runId: existingRunId,
          status: completedRun.status,
          isExistingRun: true,
          contextUpdates: {
            runId: existingRunId,
          },
        };
      }
    }

    // Support FEATURE_E2E_FIXTURES mode for deterministic testing
    const useFixtures = isE2EFixturesEnabled();
    if (useFixtures) {
      logger.info(
        { queryId: validatedInput.queryId, action: 'startScan' },
        'FEATURE_E2E_FIXTURES=true: Using deterministic test mode - completing run immediately'
      );

      // In fixture mode, create a run and immediately mark it as completed
      // This allows GetResultsAction to return fixture results without waiting for workflow execution
      const run = await runManager.createRun('workflow', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        queryId: validatedInput.queryId,
        ...(session.context.selectedWebsiteIds ? {
          selectedWebsites: session.context.selectedWebsiteIds,
        } : {}),
        ...(session.context.query ? {
          query: session.context.query,
        } : {}),
      });
      const runId = run._id!.toString();

      // Persist fixture documents to DB so verification scripts pass
      try {
        const { getCanonicalDocumentService } = await import('../../../canonical/CanonicalDocumentService.js');
        const documentService = getCanonicalDocumentService();

        // Load fixtures dynamically
        const fixturesModule = await import('../../fixtures/iploFixtures.js');
        const fixtureDocuments = fixturesModule.createIPLOFixtures(5);

        logger.info(
          { runId, count: fixtureDocuments.length },
          'Persisting fixture documents for E2E verification'
        );

        for (const doc of fixtureDocuments) {
          const draft = {
            ...doc,
            // Make sourceId unique per run to prevent collisions when multiple
            // fixture-mode runs upsert by sourceId and overwrite each other's
            // queryId/workflowRunId linkage
            sourceId: `${doc.sourceId}-${runId}`,
            enrichmentMetadata: {
              ...(doc.enrichmentMetadata || {}),
              queryId: validatedInput.queryId,
              workflowRunId: runId,
              stepId: 'start-scan-fixtures',
            }
          };

          // Use type assertion as draft might not perfectly match CanonicalDocumentDraft depending on fixture strictness
          await documentService.upsertBySourceId(draft as any, { requestId: runId });
        }
      } catch (error) {
        logger.warn({ error, runId }, 'Failed to persist fixtures in StartScanAction');
      }

      // Immediately complete the run with fixture result structure
      // This allows GetResultsAction to return fixture documents immediately
      await runManager.completeRun(runId, {
        documents: [], // Empty array - GetResultsAction will return fixtures
        fixtureMode: true, // Flag to indicate fixture mode was used
      });

      logger.info(
        { queryId: validatedInput.queryId, runId, action: 'startScan' },
        'Created and completed workflow run immediately (fixture mode)'
      );

      // Record action execution
      let actionId: string | undefined;
      try {
        const actionExecution = await actionExecutionService.recordAction('startScan', {
          queryId: validatedInput.queryId,
          sessionId: session.sessionId,
        }, {
          workflowRunId: runId,
          status: 'completed',
        });
        actionId = actionExecution.actionId;
        await actionExecutionService.markCompleted(actionExecution.actionId, { runId, status: 'completed' }, runId);
      } catch (error) {
        logger.warn({ error }, 'Failed to record action execution (non-fatal)');
      }

      return {
        runId,
        status: 'completed',
        isExistingRun: false,
        actionId,
        contextUpdates: {
          runId,
        },
      };
    }

    // Get userId from session context for configuration application
    const userId = session.context.userId as string | undefined;
    
    // Get active configuration for metadata and feature flags
    let activeConfig = null;
    if (userId) {
      try {
        activeConfig = await WorkflowConfigurationService.getActiveConfiguration(userId);
      } catch (error) {
        logger.warn(
          { error, userId },
          'Failed to get active configuration (non-fatal)'
        );
      }
    }

    // Get Query document to extract parameters (onderwerp, overheidsinstantie, overheidstype, etc.)
    // Reuse db from earlier initialization
    const queriesCollection = db.collection('queries');
    let queryDocument: { 
      onderwerp?: string; 
      thema?: string; 
      overheidslaag?: string; 
      overheidsinstantie?: string; 
      overheidstype?: string;
      [key: string]: unknown; // Allow additional fields that might exist in the document
    } | null = null;
    
    try {
      const queryIdObj = new ObjectId(validatedInput.queryId);
      queryDocument = await queriesCollection.findOne({ _id: queryIdObj }) as any;
      if (queryDocument) {
        logger.debug(
          { queryId: validatedInput.queryId, hasOnderwerp: !!queryDocument.onderwerp },
          'Fetched Query document for workflow parameters'
        );
      }
    } catch (error) {
      logger.warn({ error, queryId: validatedInput.queryId }, 'Failed to fetch Query document (non-fatal)');
    }

    // Convert municipality name to bevoegdgezagCode if overheidsinstantie is provided
    let bevoegdgezagCode: string | undefined;
    if (queryDocument?.overheidsinstantie) {
      try {
        const { GemeenteModel } = await import('../../../../models/Gemeente.js');
        
        // Normalize municipality name: remove "Gemeente " prefix and trim
        const normalizedName = queryDocument.overheidsinstantie
          .replace(/^gemeente\s+/i, '')
          .trim();
        
        // Try to find municipality by name
        const gemeente = await GemeenteModel.findByName(normalizedName);
        
        if (gemeente && gemeente.municipalityCode) {
          bevoegdgezagCode = gemeente.municipalityCode;
          logger.info(
            {
              queryId: validatedInput.queryId,
              overheidsinstantie: queryDocument.overheidsinstantie,
              normalizedName,
              bevoegdgezagCode,
              gemeenteNaam: gemeente.naam,
            },
            'Converted municipality name to bevoegdgezagCode for geometry-based DSO search'
          );
        } else {
          logger.warn(
            {
              queryId: validatedInput.queryId,
              overheidsinstantie: queryDocument.overheidsinstantie,
              normalizedName,
              found: !!gemeente,
              hasMunicipalityCode: gemeente ? !!gemeente.municipalityCode : false,
            },
            'Municipality not found or missing municipalityCode - geometry-based search will be skipped'
          );
        }
      } catch (error) {
        logger.warn(
          {
            error,
            queryId: validatedInput.queryId,
            overheidsinstantie: queryDocument.overheidsinstantie,
          },
          'Failed to lookup municipality code (non-fatal) - geometry-based search will be skipped'
        );
        // Continue without bevoegdgezagCode - text-based search will still work
      }
    }

    // Prepare workflow parameters
    // Extract all available parameters from Query document
    const workflowParams: Record<string, unknown> = {
      queryId: validatedInput.queryId,
      // Extract required parameter: onderwerp (required by workflow actions)
      ...(queryDocument?.onderwerp ? { onderwerp: queryDocument.onderwerp } : {}),
      // Extract optional parameters from Query document with fallbacks
      // thema: Use queryDocument.thema if available, otherwise use onderwerp as fallback
      thema: queryDocument?.thema || queryDocument?.onderwerp || '',
      // overheidslaag: Use queryDocument.overheidslaag if available, otherwise map from overheidstype
      overheidslaag: queryDocument?.overheidslaag || queryDocument?.overheidstype || '',
      // overheidsinstantie: Extract from Query document
      ...(queryDocument?.overheidsinstantie ? { overheidsinstantie: queryDocument.overheidsinstantie } : {}),
      // overheidstype: Extract from Query document
      ...(queryDocument?.overheidstype ? { overheidstype: queryDocument.overheidstype } : {}),
      // bevoegdgezagCode: Set if municipality was found (enables geometry-based DSO search)
      ...(bevoegdgezagCode ? { bevoegdgezagCode } : {}),
      // maxResults: Set default value (50) as per workflow action documentation
      maxResults: 50,
      // Map selectedWebsiteIds to selectedWebsites for workflow action
      ...(session.context.selectedWebsiteIds ? {
        selectedWebsites: session.context.selectedWebsiteIds,
      } : {}),
      // Include query details from session context if available (fallback if Query document doesn't have onderwerp)
      ...(session.context.query && !queryDocument?.onderwerp ? {
        query: session.context.query,
        onderwerp: typeof session.context.query === 'string' ? session.context.query : String(session.context.query), // Map query to onderwerp for backward compatibility
      } : {}),
      // Include configuration metadata for auditing
      ...(activeConfig ? {
        configurationId: activeConfig._id?.toString(),
        configurationName: activeConfig.name,
        configurationWorkflowId: activeConfig.workflowId,
      } : {}),
    };
    
    // Log extracted parameters for debugging
    logger.info(
      { 
        queryId: validatedInput.queryId,
        workflowParams: {
          onderwerp: workflowParams.onderwerp,
          thema: workflowParams.thema,
          overheidslaag: workflowParams.overheidslaag,
          overheidsinstantie: workflowParams.overheidsinstantie,
          overheidstype: workflowParams.overheidstype,
          bevoegdgezagCode: workflowParams.bevoegdgezagCode,
          maxResults: workflowParams.maxResults,
          hasSelectedWebsites: !!workflowParams.selectedWebsites,
        }
      },
      'Workflow parameters prepared for execution'
    );

    // Record action execution start
    let actionId: string | undefined;
    try {
      const actionExecution = await actionExecutionService.recordAction('startScan', {
        queryId: validatedInput.queryId,
        sessionId: session.sessionId,
      }, {
        status: 'in_progress',
      });
      actionId = actionExecution.actionId;
      await actionExecutionService.markInProgress(actionId);
    } catch (error) {
      logger.warn({ error }, 'Failed to record action execution start (non-fatal)');
    }
    
    // Apply feature flags from user's active configuration if available
    let restoreFlags: (() => Promise<void>) | null = null;
    if (activeConfig && activeConfig.featureFlags && Object.keys(activeConfig.featureFlags).length > 0) {
      try {
        restoreFlags = await WorkflowConfigurationService.applyConfigurationFlags(userId!);
        logger.debug(
          { userId, queryId: validatedInput.queryId, configName: activeConfig.name, action: 'startScan' },
          'Applied feature flags from workflow configuration'
        );
      } catch (error) {
        logger.warn(
          { error, userId, queryId: validatedInput.queryId },
          'Failed to apply configuration feature flags (non-fatal) - continuing with default flags'
        );
        // Continue execution even if flag application fails
      }
    }

    try {
      // Start workflow run
      // WorkflowEngine.startWorkflow already handles idempotency for active runs,
      // but we've already checked above, so this will create a new run
      const runId = await workflowEngine.startWorkflow(workflow, workflowParams);

      logger.info(
        { queryId: validatedInput.queryId, runId, actionId, workflowId: workflow.id, action: 'startScan' },
        'Started new workflow run for document discovery'
      );

      // Get run status and verify run exists (handle timing window)
      // Retry logic to handle MongoDB write concern/indexing delays
      let run = await runManager.getRun(runId);
      let attempts = 0;
      const maxAttempts = 3;
      while (!run && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 50 * (attempts + 1)));
        run = await runManager.getRun(runId);
        attempts++;
      }
      
      // Handle case where run is not found after retries
      // This can happen due to MongoDB write concern delays or indexing issues
      // Instead of throwing, return gracefully with default status
      if (!run) {
        logger.warn(
          { queryId: validatedInput.queryId, runId, actionId, workflowId: workflow.id, attempts },
          '⚠️ Run created but not found in database after retries - returning with default status'
        );
        // Return gracefully with default status instead of throwing
        // The run was created successfully, we just can't verify it yet
        const defaultStatus = 'pending';
        
        // Update action execution with runId even though we couldn't verify the run
        if (actionId) {
          try {
            await actionExecutionService.updateAction(actionId, {
              workflowRunId: runId,
              status: 'in_progress',
            });
          } catch (error) {
            logger.warn({ error, actionId }, 'Failed to update action execution (non-fatal)');
          }
        }
        
        // Restore feature flags before returning
        if (restoreFlags) {
          try {
            await restoreFlags();
          } catch (restoreError) {
            logger.warn(
              { error: restoreError, userId },
              'Failed to restore feature flags (non-fatal)'
            );
          }
        }
        
        return {
          runId,
          status: defaultStatus,
          isExistingRun: false,
          actionId,
          contextUpdates: {
            runId,
          },
        };
      }
      
      const status = run.status || 'pending';
      
      logger.info(
        { queryId: validatedInput.queryId, runId, status, attempts: attempts + 1 },
        '✅ Run verified in database'
      );

      // Update action execution with runId
      if (actionId) {
        try {
          await actionExecutionService.updateAction(actionId, {
            workflowRunId: runId,
            status: status === 'completed' ? 'completed' : 'in_progress',
          });
        } catch (error) {
          logger.warn({ error, actionId }, 'Failed to update action execution (non-fatal)');
        }
      }

      // Restore feature flags after workflow starts (flags are applied during execution)
      // Note: We restore immediately after starting because the workflow runs asynchronously
      // and the flags are only needed during workflow step execution, not after completion
      if (restoreFlags) {
        try {
          await restoreFlags();
          logger.debug(
            { userId, queryId: validatedInput.queryId, runId },
            'Restored original feature flags after workflow start'
          );
        } catch (error) {
          logger.warn(
            { error, userId, runId },
            'Failed to restore feature flags (non-fatal) - flags may affect other workflows'
          );
        }
      }

      // Return output with context updates
      // The engine will apply contextUpdates to the session
      return {
        runId,
        status,
        isExistingRun: false,
        actionId,
        contextUpdates: {
          runId,
        },
      };
    } catch (error) {
      // Restore feature flags on error
      if (restoreFlags) {
        try {
          await restoreFlags();
        } catch (restoreError) {
          logger.warn(
            { error: restoreError, userId },
            'Failed to restore feature flags after error (non-fatal)'
          );
        }
      }

      // Mark action as failed if workflow start fails
      if (actionId) {
        try {
          await actionExecutionService.markFailed(
            actionId,
            error instanceof Error ? error.message : 'Unknown error'
          );
        } catch (updateError) {
          logger.warn({ error: updateError }, 'Failed to mark action as failed (non-fatal)');
        }
      }
      throw error;
    }
  }
}

