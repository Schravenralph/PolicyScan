/**
 * Helper functions for integrating WorkflowDocumentToKGService into workflow actions
 */

import type { CanonicalDocument } from '../../../../contracts/types.js';
import type { RunManager } from '../../../../services/workflow/RunManager.js';
import { WorkflowDocumentToKGService } from '../../../../services/knowledge-graph/workflow/WorkflowDocumentToKGService.js';
import { GraphDBKnowledgeGraphService } from '../../../../services/graphs/knowledge/GraphDBKnowledgeGraphService.js';
import { getGraphDBClient, connectGraphDB } from '../../../../config/graphdb.js';
import { RelationshipExtractionService } from '../../../../services/extraction/RelationshipExtractionService.js';
import { FeatureFlag } from '../../../../models/FeatureFlag.js';
import { logger } from '../../../../utils/logger.js';

export interface KnowledgeGraphIntegrationOptions {
  workflowRunId: string;
  workflowId?: string;
  source: string;
  validate?: boolean; // Run validation after adding (for reporting)
  strictValidation?: boolean; // Filter invalid entities/relationships BEFORE adding (default: false for backward compatibility)
  branch?: string;
  createBranch?: boolean;
  batchSize?: number; // Batch size for bulk operations (default: 50)
  enableParallelExtraction?: boolean; // Enable parallel entity/relationship extraction (default: true)
  skipPersistenceVerification?: boolean; // Skip immediate persistence verification for performance (default: false)
  queryContext?: Record<string, unknown>; // Query context (overheidslaag, entity, etc.) for jurisdiction mapping
}

/**
 * Populate knowledge graph from CanonicalDocument[] using WorkflowDocumentToKGService
 * 
 * This is the recommended way to integrate KG into workflow actions that process
 * CanonicalDocument[] arrays.
 * 
 * @param documents - Array of CanonicalDocument to build graph from
 * @param runManager - RunManager for logging
 * @param options - Integration options
 * @returns Build result or null if integration is disabled or fails
 */
export async function populateKnowledgeGraphFromDocuments(
  documents: CanonicalDocument[],
  runManager: RunManager,
  options: KnowledgeGraphIntegrationOptions
): Promise<{
  entitiesAdded: number;
  relationshipsAdded: number;
  factsExtracted: number;
  jurisdictionsExtracted: number;
  validationResults?: Array<{ type: string; message: string }>;
  persisted?: boolean;
  loaded?: boolean;
} | null> {
  // Check if workflow integration is enabled
  // WI-KG-GAP-002: Improve logging for feature flag status
  const kgEnabled = FeatureFlag.isKGEnabled();
  // Note: KG_WORKFLOW_INTEGRATION_ENABLED flag doesn't exist, defaulting to true for workflow integration
  const workflowIntegrationEnabled = true;
  const extractionEnabled = FeatureFlag.isExtractionEnabled();
  const relationshipExtractionEnabled = FeatureFlag.isRelationshipExtractionEnabled();

  // WI-KG-GAP-005: Log extraction service status
  logger.info({
    workflowRunId: options.workflowRunId,
    workflowId: options.workflowId,
    source: options.source,
    kgEnabled,
    workflowIntegrationEnabled,
    extractionEnabled,
    relationshipExtractionEnabled,
  }, 'KG extraction service status');
  
  if (!workflowIntegrationEnabled) {
    const reason = !kgEnabled 
      ? 'KG_ENABLED feature flag is disabled'
      : 'KG_WORKFLOW_INTEGRATION_ENABLED feature flag is disabled';
    
    logger.info({
      workflowRunId: options.workflowRunId,
      workflowId: options.workflowId,
      source: options.source,
      kgEnabled,
      workflowIntegrationEnabled,
      extractionEnabled,
      relationshipExtractionEnabled,
      reason
    }, 'KG integration skipped: feature flag disabled');
    
    // Log warning to workflow logs so it's visible
    await runManager.log(
      options.workflowRunId,
      `⚠️ Knowledge graph population skipped: ${reason}. Check feature flags: KG_ENABLED=${kgEnabled}, KG_WORKFLOW_INTEGRATION_ENABLED=${workflowIntegrationEnabled}`,
      'warn'
    );
    return null;
  }
  
  // Log extraction service status
  if (!extractionEnabled) {
    await runManager.log(
      options.workflowRunId,
      '⚠️ Entity extraction is disabled (KG_EXTRACTION_ENABLED=false). Only basic document metadata will be added to KG.',
      'warn'
    );
  }
  
  if (!relationshipExtractionEnabled) {
    await runManager.log(
      options.workflowRunId,
      '⚠️ Relationship extraction is disabled (KG_RELATIONSHIP_EXTRACTION_ENABLED=false). Entities will be added but no relationships will be created.',
      'warn'
    );
  }
  
  logger.debug({
    workflowRunId: options.workflowRunId,
    workflowId: options.workflowId,
    source: options.source,
    documentCount: documents.length
  }, 'KG integration enabled: populating knowledge graph from workflow documents');

  if (documents.length === 0) {
    return null;
  }

  try {
    await runManager.log(
      options.workflowRunId,
      `Populating knowledge graph from ${documents.length} ${options.source} documents...`,
      'info'
    );

    // WI-KG-GAP-004: Pre-flight GraphDB health check
    let graphdbHealthy = false;
    try {
      await connectGraphDB();
      const testClient = getGraphDBClient();
      const testService = new GraphDBKnowledgeGraphService(testClient);
      await testService.initialize();
      // Try a simple query to verify connectivity
      try {
        await testService.getStats();
        graphdbHealthy = true;
        logger.debug({ workflowRunId: options.workflowRunId }, 'GraphDB health check passed');
      } catch {
        // Stats query failed, but initialization succeeded - may still work
        graphdbHealthy = true;
        logger.warn({ workflowRunId: options.workflowRunId }, 'GraphDB initialized but stats query failed');
      }
    } catch (healthCheckError) {
      const errorMsg = healthCheckError instanceof Error ? healthCheckError.message : String(healthCheckError);
      logger.warn({
        error: errorMsg,
        workflowRunId: options.workflowRunId,
        graphdbUrl: process.env.GRAPHDB_URL || `${process.env.GRAPHDB_HOST || 'localhost'}:${process.env.GRAPHDB_PORT || '7200'}`,
        graphdbRepository: process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG',
      }, 'GraphDB health check failed - KG population may fail');
      await runManager.log(
        options.workflowRunId,
        `⚠️ GraphDB health check failed: ${errorMsg}. KG population will be attempted but may fail.`,
        'warn'
      );
    }

    // Initialize GraphDB knowledge graph service
    // WI-KG-GAP-004: Add better error handling for GraphDB connection failures
    // Always attempt to connect before getting the client, since connectGraphDB() is idempotent
    // and handles the case where a client already exists
    let graphDBClient;
    let kgService;
    try {
      // Attempt to connect (will return existing client if already connected)
      await connectGraphDB();
      graphDBClient = getGraphDBClient();
      kgService = new GraphDBKnowledgeGraphService(graphDBClient);
      await kgService.initialize();
    } catch (initError) {
      const errorMsg = initError instanceof Error ? initError.message : String(initError);
      const diagnosticInfo = {
        error: errorMsg,
        errorType: initError instanceof Error ? initError.constructor.name : typeof initError,
        graphdbUrl: process.env.GRAPHDB_URL || `${process.env.GRAPHDB_HOST || 'localhost'}:${process.env.GRAPHDB_PORT || '7200'}`,
        graphdbRepository: process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG',
        kgIntegrationEnabled: true, // Note: KG workflow integration is always enabled
        kgEnabled: FeatureFlag.isKGEnabled(),
      };
      
      logger.error({
        ...diagnosticInfo,
        workflowRunId: options.workflowRunId,
        workflowId: options.workflowId,
        source: options.source,
        documentCount: documents.length,
      }, 'Failed to initialize GraphDB for KG population');
      
      await runManager.log(
        options.workflowRunId,
        `❌ Knowledge graph population failed: GraphDB initialization error: ${errorMsg}. Diagnostic: ${JSON.stringify(diagnosticInfo)}`,
        'error'
      );
      
      return null;
    }

    // Initialize extraction services if enabled
    const relationshipExtractionService = FeatureFlag.isRelationshipExtractionEnabled()
      ? new RelationshipExtractionService()
      : undefined;

    // Initialize PolicyParser for entity extraction (replaces EntityExtractionService)
    const { PolicyParser } = await import('../../../../services/parsing/PolicyParser.js');
    const policyParser = new PolicyParser();

    // Create workflow document to KG service
    const workflowToKGService = new WorkflowDocumentToKGService(
      kgService,
      relationshipExtractionService,
      policyParser
    );

    // Build knowledge graph from canonical documents
    // IMPORTANT: Workflows always write to 'pending-changes' branch, not 'main'
    // This protects the main branch and requires manual review before merging
    let targetBranch = options.branch || 'pending-changes';
    
    // Protect main branch - redirect to pending-changes if main is requested
    if (targetBranch === 'main') {
      logger.warn({
        workflowRunId: options.workflowRunId,
        requestedBranch: 'main'
      }, 'Workflow attempted to write to main branch - redirecting to pending-changes');
      targetBranch = 'pending-changes';
    }
    
    // Ensure pending-changes branch exists
    if (targetBranch === 'pending-changes') {
      try {
        const { KnowledgeGraphVersionManager } = await import('../../../../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js');
        const { getGraphDBClient } = await import('../../../../config/graphdb.js');
        const vm = new KnowledgeGraphVersionManager(getGraphDBClient());
        await vm.initialize();
        
        // Try to get current branch to check if pending-changes exists
        try {
          // const currentBranch = await vm.getCurrentBranch(); // Unused
          // If we can get a branch, versioning is working
        } catch {
          // Create pending-changes branch if it doesn't exist
          await vm.createBranch('pending-changes', false, 'main');
          logger.info({ workflowRunId: options.workflowRunId }, 'Created pending-changes branch for workflow');
        }
      } catch (error) {
        logger.warn({ error, workflowRunId: options.workflowRunId }, 'Could not ensure pending-changes branch exists');
      }
    }
    
    // Phase 1: Use feature flag for strict validation if not explicitly set
    // For IPLO workflows, strict validation is enabled by default (markdown knowledge base is source of truth)
    let strictValidation = options.strictValidation;
    if (strictValidation === undefined) {
      // Default to feature flag value, but allow explicit override
      strictValidation = FeatureFlag.isValidationEnabled();
      // For IPLO source, default to true even if feature flag is false (markdown is source of truth)
      if (options.source === 'iplo' && !strictValidation) {
        strictValidation = true;
        logger.debug({
          workflowRunId: options.workflowRunId,
          source: options.source
        }, 'Enabling strict validation for IPLO source (markdown knowledge base is source of truth)');
      }
    }

    const buildResult = await workflowToKGService.buildFromDocuments(documents, {
      workflowRunId: options.workflowRunId,
      workflowId: options.workflowId,
      source: options.source,
      validate: options.validate !== false, // Default to true
      strictValidation: strictValidation, // Phase 1: SHACL validation
      queryContext: options.queryContext, // Query context for jurisdiction mapping
      branch: targetBranch,
      createBranch: options.createBranch || (targetBranch === 'pending-changes'),
      batchSize: options.batchSize,
      enableParallelExtraction: options.enableParallelExtraction,
      enableExtraction: extractionEnabled, // WI-KG-GAP-005: Respect feature flag
      skipPersistenceVerification: options.skipPersistenceVerification,
      onLog: async (message, level) => {
        await runManager.log(options.workflowRunId, message, level);
      }
    });

    // Log extraction statistics (WI-KG-GAP-007)
    if (buildResult.extractionStats) {
      const stats = buildResult.extractionStats;
      await runManager.log(
        options.workflowRunId,
        `📊 Extraction stats: ${stats.totalDocuments} documents (${stats.documentsWithContent} with content, ${stats.documentsMetadataOnly} metadata only); ${stats.entitiesFromContent} entities from content, ${stats.entitiesFromMetadata} from metadata only`,
        'info'
      );
    }

    // Log build results
    const hasFiltering = buildResult.filteringEnabled && (buildResult.entitiesFiltered || buildResult.relationshipsFiltered);
    const hasPerformance = buildResult.performance;
    
    let buildSummary: string;
    
    if (hasFiltering && hasPerformance) {
      // Both filtering and performance metrics
      const perf = buildResult.performance!;
      const time = (perf.totalTime / 1000).toFixed(1);
      const perfParts: string[] = [];
      if (perf.usedBulkOperations) {
        perfParts.push('bulk operaties');
      }
      if (perf.usedParallelExtraction) {
        perfParts.push('parallel');
      }
      const perfDetails = perfParts.length > 0 ? `, ${perfParts.join(', ')}` : '';
      buildSummary = `Kennisgrafiek gevuld: ${buildResult.entitiesAdded} entiteiten, ${buildResult.relationshipsAdded} relaties, ${buildResult.factsExtracted} feiten, ${buildResult.jurisdictionsExtracted} rechtsgebieden (gefilterd: ${buildResult.entitiesFiltered || 0} entiteiten, ${buildResult.relationshipsFiltered || 0} relaties) (${time}s totaal${perfDetails})`;
    } else if (hasFiltering) {
      // Only filtering statistics
      buildSummary = `Kennisgrafiek gevuld: ${buildResult.entitiesAdded} entiteiten, ${buildResult.relationshipsAdded} relaties, ${buildResult.factsExtracted} feiten, ${buildResult.jurisdictionsExtracted} rechtsgebieden (gefilterd: ${buildResult.entitiesFiltered || 0} entiteiten, ${buildResult.relationshipsFiltered || 0} relaties)`;
    } else if (hasPerformance) {
      // Only performance metrics
      const perf = buildResult.performance!;
      const time = (perf.totalTime / 1000).toFixed(1);
      const perfParts: string[] = [];
      if (perf.usedBulkOperations) {
        perfParts.push('bulk operaties');
      }
      if (perf.usedParallelExtraction) {
        perfParts.push('parallel');
      }
      const perfDetails = perfParts.length > 0 ? `, ${perfParts.join(', ')}` : '';
      buildSummary = `Kennisgrafiek gevuld: ${buildResult.entitiesAdded} entiteiten, ${buildResult.relationshipsAdded} relaties, ${buildResult.factsExtracted} feiten, ${buildResult.jurisdictionsExtracted} rechtsgebieden (${time}s totaal${perfDetails})`;
    } else {
      // Base message only
      buildSummary = `Kennisgrafiek gevuld: ${buildResult.entitiesAdded} entiteiten, ${buildResult.relationshipsAdded} relaties, ${buildResult.factsExtracted} feiten, ${buildResult.jurisdictionsExtracted} rechtsgebieden`;
    }
    
    await runManager.log(options.workflowRunId, buildSummary, 'info');

    // WI-KG-MONITORING: Track KG population metrics for monitoring
    try {
      const { WorkflowMetricsService } = await import('../../../../services/workflow/WorkflowMetricsService.js');
      const metricsService = new WorkflowMetricsService();
      
      metricsService.recordExecutionAsync({
        workflowId: options.workflowId || 'unknown',
        workflowName: 'KG Population',
        stepId: options.source || 'unknown',
        stepName: `KG Population: ${options.source}`,
        duration: buildResult.performance?.totalTime || 0,
        status: 'completed',
        metadata: {
          runId: options.workflowRunId,
          source: options.source,
          entitiesAdded: buildResult.entitiesAdded,
          relationshipsAdded: buildResult.relationshipsAdded,
          factsExtracted: buildResult.factsExtracted,
          jurisdictionsExtracted: buildResult.jurisdictionsExtracted,
          persisted: buildResult.persisted,
          loaded: buildResult.loaded,
          branch: buildResult.branch,
          usedBulkOperations: buildResult.performance?.usedBulkOperations || false,
          usedParallelExtraction: buildResult.performance?.usedParallelExtraction || false,
        },
      });
    } catch (metricsError) {
      // Don't fail KG population if metrics recording fails
      logger.debug({ error: metricsError, workflowRunId: options.workflowRunId }, 'Failed to record KG population metrics');
    }

    // Log validation results if any
    if (buildResult.validationResults && buildResult.validationResults.length > 0) {
      const errors = buildResult.validationResults.filter(r => r.type === 'error');
      const warnings = buildResult.validationResults.filter(r => r.type === 'warning');
      
      if (errors.length > 0) {
        const errorMessages = errors.slice(0, 3).map(e => e.message).join('; ') + (errors.length > 3 ? '...' : '');
        await runManager.log(
          options.workflowRunId,
          `Kennisgrafiek validatie vond ${errors.length} fouten: ${errorMessages}`,
          'warn'
        );
      }
      
      if (warnings.length > 0) {
        const warningMessages = warnings.slice(0, 3).map(w => w.message).join('; ') + (warnings.length > 3 ? '...' : '');
        await runManager.log(
          options.workflowRunId,
          `Kennisgrafiek validatie vond ${warnings.length} waarschuwingen: ${warningMessages}`,
          'info'
        );
      }
    } else if (buildResult.validationResults !== undefined) {
      await runManager.log(
        options.workflowRunId,
        'Kennisgrafiek validatie geslaagd zonder problemen',
        'info'
      );
    }

    // Log persistence and loading status
    if (buildResult.persisted === false) {
      await runManager.log(
        options.workflowRunId,
        '⚠️ Knowledge graph persistence verification failed',
        'warn'
      );
    }

    // Only log loading verification failure if it was actually attempted
    // (verification is skipped for non-main branches since entities are in branch, verification checks default branch)
    if (buildResult.loaded === false && buildResult.loadingVerified !== undefined) {
      await runManager.log(
        options.workflowRunId,
        '⚠️ Knowledge graph loading verification failed',
        'warn'
      );
    }

    // WI-KG-GAP-006: Log branch information and warn about branch isolation
    if (buildResult.branch) {
      if (buildResult.branch === 'pending-changes') {
        await runManager.log(
          options.workflowRunId,
          `branch: Entiteiten toegevoegd aan '${buildResult.branch}' branch.`,
          'info'
        );
        await runManager.log(
          options.workflowRunId,
          'Let op: Query\'s moeten mogelijk deze branch controleren als main leeg is.',
          'info'
        );
      } else {
        await runManager.log(
          options.workflowRunId,
          `branch: Entiteiten toegevoegd aan '${buildResult.branch}' branch.`,
          'info'
        );
      }
      
      // Warn if entities were added to pending-changes but auto-merge is not enabled
      if (buildResult.branch === 'pending-changes' && buildResult.entitiesAdded > 0) {
        const autoMergeEnabled = process.env.KG_AUTO_MERGE_TO_MAIN === 'true';
        if (!autoMergeEnabled) {
          await runManager.log(
            options.workflowRunId,
            `${buildResult.entitiesAdded} entiteiten toegevoegd aan 'pending-changes' branch. Om ze zichtbaar te maken in 'main' branch, ofwel: (1) Stel KG_AUTO_MERGE_TO_MAIN=true in voor automatische merge, of (2) Merge handmatig via API: POST /api/knowledge-graph/versioning/branch/merge`,
            'info'
          );
        }
      }
    }

    // WI-KG-GAP-006: Attempt automatic merge if enabled
    if (buildResult.branch === 'pending-changes' && buildResult.entitiesAdded > 0) {
      const autoMergeEnabled = process.env.KG_AUTO_MERGE_TO_MAIN === 'true';
      if (autoMergeEnabled) {
        try {
          const { KnowledgeGraphVersionManager } = await import('../../../../services/knowledge-graph/versioning/KnowledgeGraphVersionManager.js');
          const { getGraphDBClient } = await import('../../../../config/graphdb.js');
          const vm = new KnowledgeGraphVersionManager(getGraphDBClient());
          await vm.initialize();
          
          logger.info({
            workflowRunId: options.workflowRunId,
            entitiesAdded: buildResult.entitiesAdded,
            relationshipsAdded: buildResult.relationshipsAdded
          }, 'Attempting automatic merge from pending-changes to main');
          
          // Note: Merge is now implemented in KnowledgeGraphVersionManager
          const mergeResult = await vm.merge('pending-changes', 'main');
          if (mergeResult.merged) {
            await runManager.log(
              options.workflowRunId,
              `✅ Merged ${mergeResult.entitiesAdded} entities and ${mergeResult.relationshipsAdded} relationships to main branch`,
              'info'
            );

            if (mergeResult.conflicts.length > 0) {
              await runManager.log(
                options.workflowRunId,
                `⚠️  Merge completed with ${mergeResult.conflicts.length} conflicts (skipped items).`,
                'warn'
              );
            }
          } else {
            await runManager.log(
              options.workflowRunId,
              `⚠️  Merge to main failed: ${mergeResult.conflicts.length} conflicts`,
              'warn'
            );
          }
        } catch (mergeError) {
          const errorMsg = mergeError instanceof Error ? mergeError.message : String(mergeError);
          logger.warn({
            error: errorMsg,
            workflowRunId: options.workflowRunId
          }, 'Failed to merge pending-changes to main');
          await runManager.log(
            options.workflowRunId,
            `⚠️  Auto-merge failed: ${errorMsg}. Entities remain in 'pending-changes' branch.`,
            'warn'
          );
        }
      }
    }

    return {
      entitiesAdded: buildResult.entitiesAdded,
      relationshipsAdded: buildResult.relationshipsAdded,
      factsExtracted: buildResult.factsExtracted,
      jurisdictionsExtracted: buildResult.jurisdictionsExtracted,
      validationResults: buildResult.validationResults,
      persisted: buildResult.persisted,
      loaded: buildResult.loaded,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const diagnosticInfo = {
      error: errorMsg,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      graphdbUrl: process.env.GRAPHDB_URL || `${process.env.GRAPHDB_HOST || 'localhost'}:${process.env.GRAPHDB_PORT || '7200'}`,
      graphdbRepository: process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG',
      kgIntegrationEnabled: true, // Note: KG workflow integration is always enabled
      kgEnabled: FeatureFlag.isKGEnabled(),
      extractionEnabled: FeatureFlag.isExtractionEnabled(),
      relationshipExtractionEnabled: FeatureFlag.isRelationshipExtractionEnabled(),
    };
    
    logger.error({
      ...diagnosticInfo,
      workflowRunId: options.workflowRunId,
      workflowId: options.workflowId,
      source: options.source,
      documentCount: documents.length,
    }, 'Failed to populate knowledge graph from workflow documents');
    
    await runManager.log(
      options.workflowRunId,
      `❌ Knowledge graph population failed: ${errorMsg}. Diagnostic: ${JSON.stringify(diagnosticInfo)}`,
      'error'
    );
    
    // WI-KG-MONITORING: Track KG population failure for monitoring
    try {
      const { WorkflowMetricsService } = await import('../../../../services/workflow/WorkflowMetricsService.js');
      const metricsService = new WorkflowMetricsService();
      
      metricsService.recordExecutionAsync({
        workflowId: options.workflowId || 'unknown',
        workflowName: 'KG Population',
        stepId: options.source || 'unknown',
        stepName: `KG Population: ${options.source}`,
        duration: 0,
        status: 'failed',
        metadata: {
          runId: options.workflowRunId,
          source: options.source,
          error: errorMsg,
          diagnosticInfo,
        },
      });
    } catch (metricsError) {
      // Don't fail if metrics recording fails
      logger.debug({ error: metricsError, workflowRunId: options.workflowRunId }, 'Failed to record KG population failure metrics');
    }
    
    // Don't fail the workflow if KG population fails
    return null;
  }
}

