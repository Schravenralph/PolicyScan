/**
 * DSO (Omgevingswet) workflow actions
 *
 * Main entry point for registering all DSO-related workflow actions.
 *
 * Contains actions for:
 * - fetch_dso_documents_by_geometry - Geometry-based document search (uses DSO Ontsluiten v2 /_zoek endpoint)
 * - Step 2: enrich_dso_documents_optional - Enrich discovered DSO documents (migrated to canonical pipeline)
 * - search_dso_location - Location-based document search (migrated to canonical pipeline)
 *
 * NOTE: search_dso_ontsluiten_discovery action has been removed - we now only use geometry-based search.
 * All actions now use DsoAdapter and AdapterOrchestrator for consistent document processing.
 */

import { WorkflowEngine } from '../../../../services/workflow/WorkflowEngine.js';
import { RunManager } from '../../../../services/workflow/RunManager.js';
import { NavigationGraph } from '../../../../services/graphs/navigation/NavigationGraph.js';
// import { registerDSODiscoveryAction } from './discoveryActions.js'; // REMOVED: No longer using text-based discovery
import { registerDSOEnrichmentAction } from './enrichmentActions.js';
import { registerDSOLocationAction } from './locationActions.js';
import { registerGeometryDocumentAction } from './geometryDocumentActions.js';
import type { QueryPersistenceService } from '../../../../services/workflow/QueryPersistenceService.js';
import type { InputValidationService } from '../../../../services/workflow/InputValidationService.js';

/**
 * Options for DSO action registration
 */
interface DSORegistrationOptions {
    queryPersistenceService?: QueryPersistenceService;
    inputValidationService?: typeof InputValidationService | {
        validateWorkflowInput: typeof InputValidationService.validateWorkflowInput;
        formatErrorsForResponse: typeof InputValidationService.formatErrorsForResponse;
        formatErrorsForLogging: typeof InputValidationService.formatErrorsForLogging;
    };
}

/**
 * Register DSO-related workflow actions
 *
 * @param workflowEngine - Workflow engine instance
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance (for KG population)
 * @param options - Optional service dependencies for dependency injection (for testing)
 */
export function registerDSOActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null,
    options?: DSORegistrationOptions
): void {
    // NOTE: search_dso_ontsluiten_discovery action removed - we now only use geometry-based search
    // The old text-based discovery (/_suggereer endpoint) has been replaced with geometry-based search (/_zoek endpoint)

    // Register enrichment action (uses canonical pipeline)
    registerDSOEnrichmentAction(workflowEngine, runManager, {
        queryPersistenceService: options?.queryPersistenceService,
        inputValidationService: options?.inputValidationService,
    });

    // Register location search action (uses canonical pipeline)
    registerDSOLocationAction(workflowEngine, runManager, navigationGraph, {
        inputValidationService: options?.inputValidationService,
    });

    // Register geometry-based document search action (primary DSO search method)
    registerGeometryDocumentAction(workflowEngine, runManager, {
        inputValidationService: options?.inputValidationService,
    });
}
