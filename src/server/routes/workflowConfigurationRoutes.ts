/**
 * Workflow Configuration Routes
 * 
 * API endpoints for managing workflow-feature flag configurations
 * that control which workflow runs in the Beleidsscan wizard.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import {
  WorkflowConfiguration,
  type WorkflowConfigurationCreateInput,
  type WorkflowConfigurationUpdateInput,
} from '../models/WorkflowConfiguration.js';
import { FeatureFlag, KGFeatureFlag, getFeatureFlagCategory } from '../models/FeatureFlag.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { DatabaseValidationError, DatabaseQueryError } from '../utils/databaseErrorHandler.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError, AuthenticationError } from '../types/errors.js';
import { requireResourceAuthorization } from '../middleware/resourceAuthorizationMiddleware.js';

export function createWorkflowConfigurationRoutes(authService: AuthService): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticate(authService));

  /**
   * GET /api/workflow-configuration
   * Get all workflow configurations for the current user
   */
  router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AuthenticationError('User ID not found');
    }

    const configurations = await WorkflowConfiguration.findByUser(userId);

    res.json({
      configurations,
      count: configurations.length,
    });
  }));

  /**
   * GET /api/workflow-configuration/active
   * Get the currently active workflow configuration for the user
   */
  router.get('/active', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AuthenticationError('User ID not found');
    }

    // Ensure user has a default configuration
    const active = await WorkflowConfiguration.ensureDefaultConfiguration(userId);

    res.json({
      configuration: active,
      workflowId: active.workflowId,
      featureFlags: active.featureFlags,
    });
  }));

  /**
   * GET /api/workflow-configuration/workflows
   * Get all available workflows that can be selected for Beleidsscan
   */
  router.get('/workflows', asyncHandler(async (_req: Request, res: Response) => {
    const workflows = WorkflowConfiguration.getAvailableWorkflows();

    res.json({
      workflows,
    });
  }));

  /**
   * GET /api/workflow-configuration/templates
   * Get all available workflow configuration templates
   */
  router.get('/templates', asyncHandler(async (_req: Request, res: Response) => {
    const templates = WorkflowConfiguration.getAvailableTemplates();

    res.json({
      templates,
    });
  }));

  /**
   * GET /api/workflow-configuration/feature-flags
   * Get all available feature flags that can be configured
   */
  router.get('/feature-flags', asyncHandler(async (_req: Request, res: Response) => {
    try {
      // Get current flag states
      const currentFlags = FeatureFlag.getAllKGFlags();

      // Build list with flag info
      const flags = Object.values(KGFeatureFlag).map(flagName => ({
        name: flagName,
        currentValue: currentFlags[flagName] ?? true,
        category: getFeatureFlagCategory(flagName),
      }));

      res.json({
        flags,
      });
    } catch (error) {
      logger.error({ error, path: '/feature-flags' }, 'Failed to get available feature flags');
      throw error; // Let asyncHandler pass it to error middleware
    }
  }));

  /**
   * GET /api/workflow-configuration/:id
   * Get a specific workflow configuration (requires resource authorization)
   */
  router.get('/:id',
    requireResourceAuthorization('workflowConfiguration', 'id', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const configuration = await WorkflowConfiguration.findById(id);
      if (!configuration) {
        throw new NotFoundError('Workflow configuration', id);
      }

      res.json({
        configuration,
      });
    })
  );

  /**
   * POST /api/workflow-configuration
   * Create a new workflow configuration
   */
  router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AuthenticationError('User ID not found');
    }

    const { name, description, workflowId, featureFlags, isActive } = req.body;

    if (!name) {
      throw new BadRequestError('Configuration name is required');
    }
    if (!workflowId) {
      throw new BadRequestError('Workflow ID is required');
    }

    // Validate workflow exists (predefined or in database)
    const workflowExists = await validateWorkflowExists(workflowId);
    if (!workflowExists) {
      throw new BadRequestError(`Workflow with identifier '${workflowId}' not found`);
    }

    // Validate feature flags
    const flagsToValidate = featureFlags || {};
    try {
      validateFeatureFlags(flagsToValidate);
    } catch (validationError) {
      const errorMessage =
        validationError instanceof DatabaseValidationError
          ? validationError.message
          : 'Invalid feature flag names';
      throw new BadRequestError(errorMessage);
    }

    const input: WorkflowConfigurationCreateInput = {
      name,
      description,
      workflowId,
      featureFlags: flagsToValidate,
      isActive: isActive ?? false,
      createdBy: userId,
    };

    let configuration;
    try {
      configuration = await WorkflowConfiguration.create(input);
    } catch (error) {
      // Convert DatabaseValidationError to BadRequestError for proper status code (400 instead of 500)
      if (error instanceof DatabaseValidationError) {
        throw new BadRequestError(error.message);
      }
      // Handle wrapped validation errors (e.g. from handleDatabaseOperation)
      if (error instanceof DatabaseQueryError && error.originalError instanceof DatabaseValidationError) {
        throw new BadRequestError(error.originalError.message);
      }
      throw error;
    }

    // Audit log
    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      configuration._id?.toString() || 'unknown',
      {
        action: 'create',
        name: configuration.name,
        workflowId: configuration.workflowId,
      }
    );

    res.status(201).json({
      configuration,
      message: 'Workflow configuration created successfully',
    });
  }));

  /**
   * PUT /api/workflow-configuration/:id
   * Update a workflow configuration (requires resource authorization)
   */
  router.put('/:id',
    requireResourceAuthorization('workflowConfiguration', 'id', 'edit'),
    asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new AuthenticationError('User ID not found');
    }

    const { name, description, workflowId, featureFlags, isActive } = req.body;

    const input: WorkflowConfigurationUpdateInput = {};
    if (name !== undefined) input.name = name;
    if (description !== undefined) input.description = description;
    if (workflowId !== undefined) {
      // Validate workflow exists (predefined or in database)
      const workflowExists = await validateWorkflowExists(workflowId);
      if (!workflowExists) {
          throw new BadRequestError(`Workflow with identifier '${workflowId}' not found`);
      }
      input.workflowId = workflowId;
    }
    if (featureFlags !== undefined) {
      // Validate feature flags
      try {
        validateFeatureFlags(featureFlags);
      } catch (validationError) {
        const errorMessage =
          validationError instanceof DatabaseValidationError
            ? validationError.message
            : 'Invalid feature flag names';
          throw new BadRequestError(errorMessage);
      }
      input.featureFlags = featureFlags;
    }
    if (isActive !== undefined) input.isActive = isActive;

    const configuration = await WorkflowConfiguration.update(id, input, userId);

    // Audit log
    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      id,
      {
        action: 'update',
        name: configuration.name,
        workflowId: configuration.workflowId,
        changes: input,
      }
    );

    res.json({
      configuration,
      message: 'Workflow configuration updated successfully',
    });
  }));

  /**
   * POST /api/workflow-configuration/:id/activate
   * Set a configuration as the active one (requires resource authorization)
   */
  router.post('/:id/activate',
    requireResourceAuthorization('workflowConfiguration', 'id', 'edit'),
    asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new AuthenticationError('User ID not found');
    }

    const configuration = await WorkflowConfiguration.setActive(id, userId);

    // Apply the feature flags from this configuration
    const flagsApplied: Array<{ name: string; enabled: boolean }> = [];
    const flagsFailed: Array<{ name: string; error: string }> = [];

    if (configuration.featureFlags && Object.keys(configuration.featureFlags).length > 0) {
      // Validate flags first
      try {
        validateFeatureFlags(configuration.featureFlags);
      } catch (validationError) {
        const errorMessage =
          validationError instanceof DatabaseValidationError
            ? validationError.message
            : 'Invalid feature flag names';
        logger.warn({ errorMessage, id }, `[WorkflowConfiguration] Invalid flags in configuration ${id}:`);
        // Continue anyway, but mark all as failed
        for (const [flagName] of Object.entries(configuration.featureFlags)) {
          flagsFailed.push({
            name: flagName,
            error: 'Invalid flag name',
          });
        }
      }

      // Apply flags
      for (const [flagName, enabled] of Object.entries(configuration.featureFlags)) {
        // Skip invalid flags
        if (!Object.values(KGFeatureFlag).includes(flagName as KGFeatureFlag)) {
          flagsFailed.push({
            name: flagName,
            error: 'Invalid flag name',
          });
          continue;
        }

        try {
          await FeatureFlag.setKGFlag(flagName as KGFeatureFlag, enabled, userId);
          flagsApplied.push({ name: flagName, enabled });
        } catch (flagError) {
          const errorMessage =
            flagError instanceof Error ? flagError.message : 'Unknown error';
          logger.warn({ flagError, flagName }, `[WorkflowConfiguration] Failed to set flag ${flagName}:`);
          flagsFailed.push({
            name: flagName,
            error: errorMessage,
          });
        }
      }
      await FeatureFlag.refreshCache();
    }

    // Get final state of all affected flags
    const finalFlagStates: Record<string, boolean> = {};
    if (configuration.featureFlags) {
      for (const flagName of Object.keys(configuration.featureFlags)) {
        if (Object.values(KGFeatureFlag).includes(flagName as KGFeatureFlag)) {
          finalFlagStates[flagName] = FeatureFlag.isEnabled(flagName as KGFeatureFlag);
        }
      }
    }

    // Audit log
    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      id,
      {
        action: 'activate',
        name: configuration.name,
        workflowId: configuration.workflowId,
        featureFlagsApplied: flagsApplied.length,
        featureFlagsFailed: flagsFailed.length,
      }
    );

    // Build response message
    let message = `Configuration "${configuration.name}" activated`;
    if (flagsApplied.length > 0) {
      message += `. ${flagsApplied.length} feature flag(s) applied successfully`;
    }
    if (flagsFailed.length > 0) {
      message += `. ${flagsFailed.length} feature flag(s) failed to apply`;
    }

    res.json({
      configuration,
      flagsApplied,
      flagsFailed,
      finalFlagStates,
      message,
    });
  }));

  /**
   * DELETE /api/workflow-configuration/:id
   * Delete a workflow configuration (requires resource authorization)
   */
  router.delete('/:id',
    requireResourceAuthorization('workflowConfiguration', 'id', 'delete'),
    asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      throw new AuthenticationError('User ID not found');
    }

    // Get config before deleting for audit
    const configuration = await WorkflowConfiguration.findById(id);
    if (!configuration) {
        throw new NotFoundError('Workflow configuration', id);
    }

    const deleted = await WorkflowConfiguration.delete(id, userId);

    if (deleted) {
      // Audit log
      await AuditLogService.logAction(
        req,
        'system_config_changed',
        'system',
        id,
        {
          action: 'delete',
          name: configuration.name,
        }
      );

      res.json({
        message: 'Workflow configuration deleted successfully',
      });
    } else {
        throw new BadRequestError('Failed to delete configuration');
    }
  }));

  /**
   * POST /api/workflow-configuration/:id/duplicate
   * Duplicate a workflow configuration (requires resource authorization)
   */
  router.post('/:id/duplicate',
    requireResourceAuthorization('workflowConfiguration', 'id', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        throw new AuthenticationError('User ID not found');
      }

      const original = await WorkflowConfiguration.findById(id);
      if (!original) {
        throw new NotFoundError('Workflow configuration', id);
      }

    // Generate unique name if not provided
    let newName = req.body.name;
    if (!newName) {
      const baseCopyName = `${original.name} (Copy)`;
      const existingConfigs = await WorkflowConfiguration.findByUser(userId);
      const existingNames = new Set(existingConfigs.map(c => c.name));
      
      if (!existingNames.has(baseCopyName)) {
        newName = baseCopyName;
      } else {
        // Find the highest number suffix
        let maxNumber = 1;
        const namePattern = new RegExp(`^${original.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(Copy\\) (\\d+)$`);
        existingConfigs.forEach(config => {
          const match = config.name.match(namePattern);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= maxNumber) {
              maxNumber = num + 1;
            }
          }
        });
        newName = `${original.name} (Copy) ${maxNumber}`;
      }
    }

    const duplicate = await WorkflowConfiguration.create({
      name: newName,
      description: original.description,
      workflowId: original.workflowId,
      featureFlags: { ...original.featureFlags },
      isActive: false,
      createdBy: userId,
    });

    res.status(201).json({
      configuration: duplicate,
      message: 'Configuration duplicated successfully',
    });
  }));

  /**
   * GET /api/workflow-configuration/:id/export
   * Export a workflow configuration as JSON (requires resource authorization)
   */
  router.get('/:id/export',
    requireResourceAuthorization('workflowConfiguration', 'id', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const config = await WorkflowConfiguration.findById(id);
      if (!config) {
        throw new NotFoundError('Workflow configuration', id);
      }

    // Export format with metadata (excluding sensitive data)
    const exported = {
      version: 1,
      exportedAt: new Date().toISOString(),
      configuration: {
        name: config.name,
        description: config.description,
        workflowId: config.workflowId,
        featureFlags: { ...config.featureFlags },
      },
    };

    // Log workflow configuration export for audit
    AuditLogService.logDataAccess(
      req,
      'workflow',
      id,
      'export',
      {
        configurationName: config.name,
        workflowId: config.workflowId,
      }
    ).catch((error) => {
      // Don't fail request if audit logging fails
      logger.error({ error, configId: id }, 'Failed to log workflow configuration export audit event');
    });

    // Set headers for file download
    const sanitizedFileName = config.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}.json"`);
    res.json(exported);
  }));

  /**
   * POST /api/workflow-configuration/import
   * Import a workflow configuration from JSON
   */
  router.post('/import', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AuthenticationError('User ID not found');
    }

    const { exportedData, name } = req.body;

    if (!exportedData || !exportedData.configuration) {
      throw new BadRequestError('Invalid import data: missing configuration');
    }

    const { configuration } = exportedData;

    // Validate structure
    if (!configuration.name || !configuration.workflowId) {
      throw new BadRequestError('Invalid configuration: missing required fields (name, workflowId)');
    }

    // Validate workflow ID
    const availableWorkflows = WorkflowConfiguration.getAvailableWorkflows();
    const validWorkflowIds = availableWorkflows.map(w => w.id);
    if (!validWorkflowIds.includes(configuration.workflowId)) {
      throw new BadRequestError(`Invalid workflow ID: ${configuration.workflowId}. Valid workflows: ${validWorkflowIds.join(', ')}`);
    }

    // Validate feature flags
    if (configuration.featureFlags) {
      try {
        validateFeatureFlags(configuration.featureFlags);
      } catch (validationError) {
        throw new BadRequestError(validationError instanceof Error ? validationError.message : 'Invalid feature flags');
      }
    }

    // Sanitize text fields
    const sanitizedName = (name || configuration.name).trim().slice(0, 200);
    const sanitizedDescription = configuration.description ? configuration.description.trim().slice(0, 1000) : undefined;

    // Create configuration
    const imported = await WorkflowConfiguration.create({
      name: sanitizedName,
      description: sanitizedDescription,
      workflowId: configuration.workflowId,
      featureFlags: configuration.featureFlags || {},
      isActive: false, // Never auto-activate imported configs
      createdBy: userId,
    });

    // Audit log
    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      imported._id?.toString() || '',
      {
        action: 'import',
        name: imported.name,
        importedFrom: exportedData.exportedAt || 'unknown',
      }
    );

    res.status(201).json({
      configuration: imported,
      message: 'Configuration imported successfully',
    });
  }));

  return router;
}

/**
 * Validate that a workflow exists (either predefined or in database)
 */
async function validateWorkflowExists(workflowId: string): Promise<boolean> {
  // Check if it's in the available workflows list (for Beleidsscan wizard)
  const availableWorkflows = WorkflowConfiguration.getAvailableWorkflows();
  if (availableWorkflows.some(w => w.id === workflowId)) {
    return true;
  }
  
  // Check if it's a predefined workflow
  const { getWorkflowById } = await import('../utils/workflowLookup.js');
  const predefinedWorkflow = await getWorkflowById(workflowId);
  if (predefinedWorkflow) {
    return true;
  }
  
  // Check if it's in the database
  const { WorkflowModel } = await import('../models/Workflow.js');
  const workflowDoc = await WorkflowModel.findById(workflowId);
  if (workflowDoc) {
    return true;
  }
  
  return false;
}

/**
 * Validate that all feature flag names are valid KGFeatureFlag enum values
 */
function validateFeatureFlags(featureFlags: Record<string, boolean>): void {
  if (!featureFlags || Object.keys(featureFlags).length === 0) {
    return; // Empty flags are valid
  }

  const validFlagNames = Object.values(KGFeatureFlag);
  const invalidFlags = Object.keys(featureFlags).filter(
    (name) => !validFlagNames.includes(name as KGFeatureFlag)
  );

  if (invalidFlags.length > 0) {
    throw new DatabaseValidationError(
      `Invalid feature flag names: ${invalidFlags.join(', ')}. Valid flags are: ${validFlagNames.join(', ')}`
    );
  }
}


