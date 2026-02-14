import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import { FeatureFlag, KGFeatureFlag, getFeatureFlagCategory } from '../models/FeatureFlag.js';
import { FeatureFlagTemplate } from '../models/FeatureFlagTemplate.js';
import { AuditLogService } from '../services/AuditLogService.js';
import { KG_BENCHMARK_CONFIGS } from '../config/kgBenchmarkConfigs.js';
import { getFeatureFlagDependencyService } from '../services/feature-flags/FeatureFlagDependencyService.js';
import { getFeatureFlagsService } from '../services/knowledge-graph/KnowledgeGraphFeatureFlags.js';
import { getFeatureFlagAnalyticsService } from '../services/feature-flags/FeatureFlagAnalyticsService.js';
import { DatabaseValidationError, DatabaseQueryError } from '../utils/databaseErrorHandler.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError, ConflictError, AuthorizationError } from '../types/errors.js';

// Validate that KG_BENCHMARK_CONFIGS is available at module load time
if (!KG_BENCHMARK_CONFIGS) {
  console.error('[FeatureFlags] WARNING: KG_BENCHMARK_CONFIGS is not available at module load time');
}

export function createFeatureFlagsRoutes(
  authService: AuthService
): Router {
  const router = Router();

  // All routes require authentication and admin role
  router.use(authenticate(authService));
  router.use(authorize(['admin']));

  /**
   * GET /api/feature-flags
   * Get all feature flags with their current states
   */
  router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    // Ensure flags are initialized
    await FeatureFlag.initializeService();
    
    const flags = FeatureFlag.getAllKGFlags();
    const flagDetails = await FeatureFlag.getKGFlags();
    
    // Create a map of database details by name
    const detailsMap = new Map(flagDetails.map(d => [d.name, d]));
    
    // Get all KG flag names from enum
    const allKGFlagNames = Object.values(KGFeatureFlag);
    
    // Build result with ALL flags, using defaults if not in database
    const result = allKGFlagNames.map((flagName) => {
      const detail = detailsMap.get(flagName);
      const enabled = flags[flagName] ?? detail?.enabled ?? true;
      
      return {
        name: flagName,
        enabled,
        description: detail?.description || getDefaultDescription(flagName),
        category: detail?.category || getFeatureFlagCategory(flagName),
        updatedAt: detail?.updatedAt,
        updatedBy: detail?.updatedBy,
        // Indicate if value comes from env var (higher priority)
        source: process.env[flagName] !== undefined ? 'environment' : (detail ? 'database' : 'default'),
      };
    });

    res.json({
      flags: result,
      allFlags: flags, // Quick lookup map
    });
  }));
  
  // Helper function to get default descriptions
  function getDefaultDescription(flagName: string): string {
    // This will be populated from initializeKGFlags defaults if needed
    return `Feature flag: ${flagName}`;
  }

  /**
   * POST /api/feature-flags/refresh
   * Refresh the feature flag cache from database
   */
  router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
    await FeatureFlag.refreshCache();

    // Log to audit log
    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      'feature-flags-cache',
      {
        description: 'Feature flags cache refreshed',
      }
    );

    res.json({ message: '[i18n:apiMessages.featureFlagsCacheRefreshed]' });
  }));

  /**
   * GET /api/feature-flags/templates
   * Get all available feature flag template configurations
   */
  router.get('/templates', asyncHandler(async (_req: Request, res: Response) => {
    // Check if KG_BENCHMARK_CONFIGS is available
    if (!KG_BENCHMARK_CONFIGS || !Array.isArray(KG_BENCHMARK_CONFIGS)) {
      throw new BadRequestError('Feature flag templates configuration is not available');
    }

    const templates = KG_BENCHMARK_CONFIGS.map(config => ({
      name: config.name,
      description: config.description,
      featureFlags: config.featureFlags,
    }));

    res.json({
      templates,
    });
  }));

  /**
   * POST /api/feature-flags/templates/:templateName/apply
   * Apply a template configuration to feature flags with validation
   */
  router.post('/templates/:templateName/apply', asyncHandler(async (req: Request, res: Response) => {
    const { templateName } = req.params;
    const { validate = true } = req.body;
    const template = KG_BENCHMARK_CONFIGS.find(t => t.name === templateName);
    
    if (!template) {
      throw new NotFoundError('Template', templateName, {
        availableTemplates: KG_BENCHMARK_CONFIGS.map(t => t.name),
      });
    }

    // Validate template configuration if requested
    if (validate) {
      const dependencyService = getFeatureFlagDependencyService();
      const validation = await dependencyService.validateConfiguration(template.featureFlags);
      
      if (!validation.valid) {
        throw new BadRequestError('Template configuration is invalid', {
          validation,
          templateName,
        });
      }
    }

    // Get current user for audit log
    const user = req.user;
    const updatedBy = user?.email || 'unknown';

    // Update all flags from template
    for (const [flagName, enabled] of Object.entries(template.featureFlags)) {
      // Only update if not set via env var
      if (process.env[flagName] === undefined) {
        if (Object.values(KGFeatureFlag).includes(flagName as KGFeatureFlag)) {
          await FeatureFlag.setKGFlag(flagName as KGFeatureFlag, enabled as boolean, updatedBy);
        } else {
          await FeatureFlag.upsert({
            name: flagName,
            enabled: enabled as boolean,
            updatedBy,
          });
        }
      }
    }

    // Log to audit log
    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      'feature-flags-template-applied',
      {
        description: `Feature flags template "${templateName}" applied`,
        templateName,
        flags: template.featureFlags,
      }
    );

    const currentFlags = FeatureFlag.getAllKGFlags();

    res.json({
      message: `[i18n:apiMessages.templateAppliedSuccessfully]|${templateName}`,
      templateName,
      flags: currentFlags,
    });
  }));

  /**
   * POST /api/feature-flags/benchmark-config
   * Save a feature flag configuration for benchmarking
   * Body: { flags: { [flagName]: boolean }, name?: string }
   */
  router.post('/benchmark-config', asyncHandler(async (req: Request, res: Response) => {
    const { flags, name } = req.body;

    if (!flags || typeof flags !== 'object') {
      throw new BadRequestError('flags must be an object with flag names as keys and boolean values');
    }

    // Validate all flags
    for (const flagName of Object.keys(flags)) {
      if (typeof flags[flagName] !== 'boolean') {
        throw new BadRequestError(`Flag ${flagName} must have a boolean value`);
      }
      // Validate flag name format
      if (!flagName.match(/^[A-Z_]+$/)) {
        throw new BadRequestError(`Invalid feature flag name format: ${flagName}`, {
          note: 'Flag names must be uppercase with underscores (e.g., HYBRID_RETRIEVAL_ENABLED)',
        });
      }
    }

    // Get current user for audit log
    const user = req.user;
    const updatedBy = user?.email || 'unknown';

    // Update all flags
    for (const [flagName, enabled] of Object.entries(flags)) {
      // Only update if not set via env var
      if (process.env[flagName] === undefined) {
        if (Object.values(KGFeatureFlag).includes(flagName as KGFeatureFlag)) {
          await FeatureFlag.setKGFlag(flagName as KGFeatureFlag, enabled as boolean, updatedBy);
        } else {
          await FeatureFlag.upsert({
            name: flagName,
            enabled: enabled as boolean,
            updatedBy,
          });
        }
      }
    }

    // Log to audit log
    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      'feature-flags-benchmark-config',
      {
        description: `Feature flags set for benchmark config: ${name || 'unnamed'}`,
        flags,
        configName: name,
      }
    );

    const currentFlags = FeatureFlag.getAllKGFlags();

    res.json({
      message: '[i18n:apiMessages.benchmarkConfigApplied]',
      configName: name,
      flags: currentFlags,
    });
  }));

  /**
   * POST /api/feature-flags/validate
   * Validate a feature flag configuration
   */
  router.post('/validate', asyncHandler(async (req: Request, res: Response) => {
    const { flags } = req.body;

    if (!flags || typeof flags !== 'object') {
      throw new BadRequestError('flags must be an object with flag names as keys and boolean values');
    }

    const dependencyService = getFeatureFlagDependencyService();
    const validation = await dependencyService.validateConfiguration(flags);

    res.json(validation);
  }));

  /**
   * GET /api/feature-flags/dependencies
   * Get dependency graph for all flags or a specific flag
   */
  router.get('/dependencies/:flagName?', asyncHandler(async (req: Request, res: Response) => {
    const { flagName } = req.params;
    const dependencyService = getFeatureFlagDependencyService();

    if (flagName) {
      const graph = dependencyService.getDependencyGraph(flagName);
      if (!graph) {
        throw new NotFoundError(`Flag ${flagName} not found in dependency graph`);
      }
      res.json(graph);
    } else {
      const allGraphs = dependencyService.getAllDependencyGraphs();
      const graphsArray = Array.from(allGraphs.values());
      res.json({ dependencies: graphsArray });
    }
  }));

  /**
   * GET /api/feature-flags/dependencies/all
   * Get all dependency definitions
   */
  router.get('/dependencies/all/definitions', asyncHandler(async (_req: Request, res: Response) => {
    const dependencyService = getFeatureFlagDependencyService();
    const dependencies = dependencyService.getAllDependencies();
    res.json({ dependencies });
  }));

  /**
   * GET /api/feature-flags/:flagName
   * Get a specific feature flag
   */
  router.get('/:flagName', asyncHandler(async (req: Request, res: Response) => {
    const { flagName } = req.params;

    // Validate flag name format (allow any valid flag name, not just KG flags)
    if (!flagName.match(/^[A-Z_]+$/)) {
      throw new BadRequestError(`Invalid feature flag name format: ${flagName}`, {
        note: 'Flag names must be uppercase with underscores (e.g., HYBRID_RETRIEVAL_ENABLED)',
        knownKGFlags: Object.values(KGFeatureFlag),
      });
    }

    const enabled = FeatureFlag.isEnabled(flagName as KGFeatureFlag);
    const details = await FeatureFlag.findByName(flagName);

    res.json({
      name: flagName,
      enabled,
      description: details?.description,
      updatedAt: details?.updatedAt,
      updatedBy: details?.updatedBy,
      source: process.env[flagName] !== undefined ? 'environment' : 'database',
    });
  }));

  /**
   * PATCH /api/feature-flags/:flagName
   * Update a feature flag with dependency validation and cascade handling
   */
  router.patch('/:flagName', asyncHandler(async (req: Request, res: Response) => {
    const { flagName } = req.params;
    const { enabled, cascade = true } = req.body;

    // Validate flag name format
    if (!flagName.match(/^[A-Z_]+$/)) {
      throw new BadRequestError(`Invalid feature flag name format: ${flagName}`, {
        note: 'Flag names must be uppercase with underscores (e.g., HYBRID_RETRIEVAL_ENABLED)',
        knownKGFlags: Object.values(KGFeatureFlag),
      });
    }

    // Validate enabled value
    if (typeof enabled !== 'boolean') {
      throw new BadRequestError('enabled must be a boolean value');
    }

    // Check if env var is set (can't override via API)
    if (process.env[flagName] !== undefined) {
      throw new BadRequestError(`Cannot update flag ${flagName}: it is set via environment variable ${flagName}`, {
        currentValue: process.env[flagName],
      });
    }

      // Get current flag states
      const featureFlagsService = getFeatureFlagsService();
      const currentFlags = featureFlagsService.getAllFlags();

      // Validate the change
      const dependencyService = getFeatureFlagDependencyService();
      const validation = await dependencyService.validateFlagChange(
        flagName,
        enabled,
        currentFlags
      );

      if (!validation.valid) {
        throw new BadRequestError('Flag change would create invalid configuration', validation as unknown as Record<string, unknown>);
      }

      // Get current user for audit log
      const user = req.user;
      const updatedBy = user?.email || 'unknown';

      // Track analytics (before change)
      const analyticsService = getFeatureFlagAnalyticsService();
      const previousValue = currentFlags[flagName] ?? false;

      // Handle cascade operations
      const flagsToUpdate: Array<{ name: string; enabled: boolean }> = [{ name: flagName, enabled }];

      if (cascade) {
        if (enabled) {
          // Cascade enable: enable required flags and parents
          const cascadeFlags = dependencyService.getCascadeEnableFlags(flagName);
          for (const cascadeFlag of cascadeFlags) {
            // Only enable if not set via env var
            if (process.env[cascadeFlag] === undefined) {
              flagsToUpdate.push({ name: cascadeFlag, enabled: true });
            }
          }
        } else {
          // Cascade disable: disable child flags
          const cascadeFlags = dependencyService.getCascadeDisableFlags(flagName);
          for (const cascadeFlag of cascadeFlags) {
            // Only disable if not set via env var
            if (process.env[cascadeFlag] === undefined) {
              flagsToUpdate.push({ name: cascadeFlag, enabled: false });
            }
          }
        }
      }

      // Update all flags
      for (const flagUpdate of flagsToUpdate) {
        if (Object.values(KGFeatureFlag).includes(flagUpdate.name as KGFeatureFlag)) {
          await FeatureFlag.setKGFlag(flagUpdate.name as KGFeatureFlag, flagUpdate.enabled, updatedBy);
        } else {
          await FeatureFlag.upsert({
            name: flagUpdate.name,
            enabled: flagUpdate.enabled,
            updatedBy,
          });
        }
      }

      // Refresh cache
      await featureFlagsService.refreshCache(flagsToUpdate.map(f => f.name));

      // Track analytics (using variables declared earlier)
      await analyticsService.trackChange(
        flagName,
        previousValue,
        enabled,
        updatedBy,
        'Flag updated via API',
        flagsToUpdate.length > 1 ? flagsToUpdate.filter(f => f.name !== flagName).map(f => f.name) : undefined
      );

      // Log to audit log
      await AuditLogService.logAction(
        req,
        'system_config_changed',
        'system',
        flagName,
        {
          flagName,
          enabled,
          previousValue: !enabled,
          cascadeFlags: flagsToUpdate.length > 1 ? flagsToUpdate.map(f => f.name) : undefined,
        }
      );

      // Get updated flag state
      const updatedEnabled = Object.values(KGFeatureFlag).includes(flagName as KGFeatureFlag)
        ? FeatureFlag.isEnabled(flagName as KGFeatureFlag)
        : (await FeatureFlag.findByName(flagName))?.enabled ?? false;
      const details = await FeatureFlag.findByName(flagName);

      res.json({
        name: flagName,
        enabled: updatedEnabled,
        description: details?.description,
        updatedAt: details?.updatedAt,
        updatedBy: details?.updatedBy,
        source: 'database',
        cascadeFlags: flagsToUpdate.length > 1 ? flagsToUpdate : undefined,
        warnings: validation.warnings,
      });
  }));

  /**
   * GET /api/feature-flags/analytics/health
   * Get health metrics for all flags or a specific flag
   */
  router.get('/analytics/health', asyncHandler(async (req: Request, res: Response) => {
    const { flagName, days } = req.query;
    const analyticsService = getFeatureFlagAnalyticsService();
    const daysNum = days ? parseInt(days as string, 10) : 30;

    if (flagName) {
      const metrics = await analyticsService.getFlagHealthMetrics(flagName as string, daysNum);
      if (!metrics) {
        throw new NotFoundError(`Flag ${flagName} not found`);
      }
      return res.json(metrics);
    }

    // Get all flags
    const allFlags = await FeatureFlag.findAll();
    const metrics = await Promise.all(
      allFlags.map(flag => analyticsService.getFlagHealthMetrics(flag.name, daysNum))
    );

    res.json(metrics.filter(m => m !== null));
  }));

  /**
   * GET /api/feature-flags/analytics/unused
   * Get unused flags
   */
  router.get('/analytics/unused', asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.query;
    const analyticsService = getFeatureFlagAnalyticsService();
    const daysNum = days ? parseInt(days as string, 10) : 30;

    const unusedFlags = await analyticsService.getUnusedFlags(daysNum);
    res.json({ unusedFlags, days: daysNum });
  }));

  /**
   * GET /api/feature-flags/analytics/impact/:flagName
   * Get impact analysis for a flag
   */
  router.get('/analytics/impact/:flagName', asyncHandler(async (req: Request, res: Response) => {
    const { flagName } = req.params;
    const { days } = req.query;
    const analyticsService = getFeatureFlagAnalyticsService();
    const daysNum = days ? parseInt(days as string, 10) : 30;

    const impact = await analyticsService.getFlagImpactAnalysis(flagName, daysNum);
    res.json(impact);
  }));

  /**
   * GET /api/feature-flags/analytics/history
   * Get check history
   */
  router.get('/analytics/history', asyncHandler(async (req: Request, res: Response) => {
    const { flagName, startDate, endDate, limit } = req.query;
    const analyticsService = getFeatureFlagAnalyticsService();

    const history = await analyticsService.getCheckHistory(
      flagName as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
      limit ? parseInt(limit as string, 10) : 1000
    );

    res.json(history);
  }));

  /**
   * GET /api/feature-flags/analytics/changes
   * Get change history
   */
  router.get('/analytics/changes', asyncHandler(async (req: Request, res: Response) => {
    const { flagName, startDate, endDate, limit } = req.query;
    const analyticsService = getFeatureFlagAnalyticsService();

    const changes = await analyticsService.getChangeHistory(
      flagName as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
      limit ? parseInt(limit as string, 10) : 100
    );

    res.json(changes);
  }));

  /**
   * GET /api/feature-flags/analytics/stats
   * Get usage statistics
   */
  router.get('/analytics/stats', asyncHandler(async (req: Request, res: Response) => {
    const { flagName, startDate, endDate } = req.query;
    const analyticsService = getFeatureFlagAnalyticsService();

    const stats = await analyticsService.getUsageStats(
      flagName as string | undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.json(stats);
  }));
  /**
   * GET /api/feature-flags/analytics/report
   * Generate usage report
   */
  router.get('/analytics/report', asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, flagNames } = req.query;
    const analyticsService = getFeatureFlagAnalyticsService();

    if (!startDate || !endDate) {
      throw new BadRequestError('startDate and endDate are required');
    }

    const report = await analyticsService.generateUsageReport(
      new Date(startDate as string),
      new Date(endDate as string),
      flagNames ? (flagNames as string).split(',') : undefined
    );

    res.json(report);
  }));

  // ============================================================================
  // MongoDB-based Template Management (WI-415)
  // ============================================================================

  /**
   * GET /api/feature-flags/templates/db
   * Get all templates from MongoDB (separate from benchmark configs)
   */
  router.get('/templates/db', asyncHandler(async (req: Request, res: Response) => {
    const { isPublic, isDefault, createdBy } = req.query;
    const user = req.user;

    const filter: {
      isPublic?: boolean;
      isDefault?: boolean;
      createdBy?: string;
    } = {};

    // If not admin, only show public templates or user's own templates
    if (user?.role !== 'admin') {
      filter.isPublic = true;
      if (user?.email) {
        // Also include user's own templates
        const templates = await FeatureFlagTemplate.findAll();
        const filtered = templates.filter(
          t => t.isPublic || t.createdBy === user.email
        );
        return res.json({ templates: filtered });
      }
    } else {
      // Admin can see all templates
      // Handle boolean query parameters (they come as strings 'true' or 'false')
      if (isPublic !== undefined) {
        const isPublicValue = typeof isPublic === 'string' ? isPublic : String(isPublic);
        filter.isPublic = isPublicValue === 'true' || isPublicValue === '1';
      }
      if (isDefault !== undefined) {
        const isDefaultValue = typeof isDefault === 'string' ? isDefault : String(isDefault);
        filter.isDefault = isDefaultValue === 'true' || isDefaultValue === '1';
      }
      if (createdBy) filter.createdBy = typeof createdBy === 'string' ? createdBy : String(createdBy);
    }

    const templates = await FeatureFlagTemplate.findAll(filter);
    res.json({ templates });
  }));
  /**
   * GET /api/feature-flags/templates/db/:id
   * Get a specific template by ID
   */
  router.get('/templates/db/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user;

    const template = await FeatureFlagTemplate.findById(id);
    if (!template) {
      throw new NotFoundError('Template', id);
    }

    // Check access: public templates or user's own templates or admin
    if (!template.isPublic && template.createdBy !== user?.email && user?.role !== 'admin') {
      throw new AuthorizationError('Access denied to template');
    }

    res.json({ template });
  }));

  /**
   * POST /api/feature-flags/templates/db
   * Create a new template
   */
  router.post('/templates/db', asyncHandler(async (req: Request, res: Response) => {
    const { name, description, flags, isPublic, isDefault } = req.body;
    const user = req.user;

    if (!name || !flags) {
      throw new BadRequestError('name and flags are required', {
        received: { name: !!name, flags: !!flags },
      });
    }

    // Validate flags exist
    const dependencyService = getFeatureFlagDependencyService();
    const validation = await dependencyService.validateConfiguration(flags);
    if (!validation.valid) {
      throw new BadRequestError('Template configuration is invalid', { validation });
    }

    try {
      const template = await FeatureFlagTemplate.create({
        name,
        description,
        flags,
        isPublic: isPublic ?? false,
        isDefault: isDefault ?? false,
        createdBy: user?.email || 'unknown',
      });

      res.status(201).json({ template });
    } catch (error) {
      if (error instanceof DatabaseValidationError && error.message.includes('already exists')) {
        throw new ConflictError(error.message);
      }
      if (error instanceof DatabaseQueryError && error.originalError instanceof DatabaseValidationError) {
        if (error.originalError.message.includes('already exists')) {
          throw new ConflictError(error.originalError.message);
        }
      }
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new ConflictError(error.message);
      }
      throw error;
    }
  }));

  /**
   * PATCH /api/feature-flags/templates/db/:id
   * Update a template
   */
  router.patch('/templates/db/:id', asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, flags, isPublic, isDefault } = req.body;
      const user = req.user;

      const existing = await FeatureFlagTemplate.findById(id);
      if (!existing) {
        throw new NotFoundError('Template', id);
      }

      // Check access: user can only update their own templates (unless admin)
      if (existing.createdBy !== user?.email && user?.role !== 'admin') {
        throw new AuthorizationError('Access denied');
      }

      // Validate flags if provided
      if (flags) {
        const dependencyService = getFeatureFlagDependencyService();
        const validation = await dependencyService.validateConfiguration(flags);
        if (!validation.valid) {
          throw new BadRequestError('Template configuration is invalid', {
            validation,
          });
        }
      }

      const update: {
        name?: string;
        description?: string;
        flags?: Record<string, boolean>;
        isPublic?: boolean;
        isDefault?: boolean;
      } = {};

      if (name !== undefined) update.name = name;
      if (description !== undefined) update.description = description;
      if (flags !== undefined) update.flags = flags;
      if (isPublic !== undefined) update.isPublic = isPublic;
      if (isDefault !== undefined) update.isDefault = isDefault;

      const template = await FeatureFlagTemplate.update(id, update);

      await AuditLogService.logAction(
        req,
        'system_config_changed',
        'system',
        'feature-flags-template-updated',
        {
          description: `Feature flag template "${template.name}" updated`,
          templateId: id,
        }
      );

      res.json({ template });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new ConflictError(error.message);
      }
      throw error;
    }
  }));

  /**
   * DELETE /api/feature-flags/templates/db/:id
   * Delete a template
   */
  router.delete('/templates/db/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user;

    const existing = await FeatureFlagTemplate.findById(id);
    if (!existing) {
      throw new NotFoundError('Template', id);
    }

    // Check access: user can only delete their own templates (unless admin)
    // Default templates cannot be deleted
    if (existing.isDefault && user?.role !== 'admin') {
      throw new AuthorizationError('Default templates cannot be deleted');
    }

    if (existing.createdBy !== user?.email && user?.role !== 'admin') {
      throw new AuthorizationError('Access denied');
    }

    const deleted = await FeatureFlagTemplate.delete(id);
    if (!deleted) {
      throw new NotFoundError('Template', id);
    }

    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      'feature-flags-template-deleted',
      {
        description: `Feature flag template "${existing.name}" deleted`,
        templateId: id,
      }
    );

    res.json({ message: '[i18n:apiMessages.templateDeleted]' });
  }));
  /**
   * POST /api/feature-flags/templates/db/:id/apply
   * Apply a template to current feature flags
   */
  router.post('/templates/db/:id/apply', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { validate = true } = req.body;
    const user = req.user;

    const template = await FeatureFlagTemplate.findById(id);
    if (!template) {
      throw new NotFoundError('Template', id);
    }

    // Check access
    if (!template.isPublic && template.createdBy !== user?.email && user?.role !== 'admin') {
      throw new AuthorizationError('Access denied to template');
    }

    // Validate template configuration if requested
    if (validate) {
      const dependencyService = getFeatureFlagDependencyService();
      const validation = await dependencyService.validateConfiguration(template.flags);
      if (!validation.valid) {
        throw new BadRequestError('Template configuration is invalid', {
          validation,
        });
      }
    }

    const updatedBy = user?.email || 'unknown';

    // Update all flags from template
    for (const [flagName, enabled] of Object.entries(template.flags)) {
      // Only update if not set via env var
      if (process.env[flagName] === undefined) {
        if (Object.values(KGFeatureFlag).includes(flagName as KGFeatureFlag)) {
          await FeatureFlag.setKGFlag(flagName as KGFeatureFlag, enabled, updatedBy);
        } else {
          await FeatureFlag.upsert({
            name: flagName,
            enabled,
            updatedBy,
          });
        }
      }
    }

    // Increment usage count
    await FeatureFlagTemplate.incrementUsage(id);

    await AuditLogService.logAction(
      req,
      'system_config_changed',
      'system',
      'feature-flags-template-applied',
      {
        description: `Feature flag template "${template.name}" applied`,
        templateId: id,
      }
    );

    const currentFlags = FeatureFlag.getAllKGFlags();

    res.json({
      message: `[i18n:apiMessages.templateAppliedSuccessfully]|${template.name}`,
      templateId: id,
      flags: currentFlags,
    });
  }));

  /**
   * POST /api/feature-flags/templates/db/from-current
   * Create a template from current feature flag state
   */
  router.post('/templates/db/from-current', asyncHandler(async (req: Request, res: Response) => {
    try {
      const { name, description, isPublic, isDefault, flags } = req.body;
      const user = req.user;

      if (!name) {
        throw new BadRequestError('name is required', { received: { name: !!name } });
      }

      // Use provided flags if available (for draft mode), otherwise get current flag states
      const flagsToSave = flags || FeatureFlag.getAllKGFlags();

    // Create template from provided or current state
    const template = await FeatureFlagTemplate.create({
      name,
      description,
      flags: flagsToSave,
      isPublic: isPublic ?? false,
      isDefault: isDefault ?? false,
      createdBy: user?.email || 'unknown',
    });

      res.status(201).json({ template });
    } catch (error) {
      if (error instanceof DatabaseValidationError && error.message.includes('already exists')) {
        throw new ConflictError(error.message);
      }
      if (error instanceof DatabaseQueryError && error.originalError instanceof DatabaseValidationError) {
        if (error.originalError.message.includes('already exists')) {
          throw new ConflictError(error.originalError.message);
        }
      }
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new ConflictError(error.message);
      }
      throw error;
    }
  }));

  return router;
}
