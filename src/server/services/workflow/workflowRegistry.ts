/**
 * Workflow Registry
 * 
 * Central registry for workflow lookup by ID.
 * This module provides a single source of truth for mapping workflow IDs to workflow definitions,
 * preventing drift between API routes and queue workers.
 * 
 * @module workflowRegistry
 */

import type { Workflow } from '../infrastructure/types.js';
import {
    explorationWorkflow,
    standardScanWorkflow,
    quickIploScanWorkflow,
    externalLinksWorkflow,
    beleidsscanGraphWorkflow,
    bfs3HopWorkflow,
    // horstAanDeMaasSimpleWorkflow removed - use horstAanDeMaasWorkflow instead
    horstAanDeMaasWorkflow,
    horstLaborMigrationWorkflow,
    beleidsscanWizardWorkflow,
    beleidsscanStep1SearchDsoWorkflow,
    beleidsscanStep2EnrichDsoWorkflow,
    beleidsscanStep3SearchIploWorkflow,
    beleidsscanStep4ScanKnownSourcesWorkflow,
    beleidsscanStep5SearchOfficieleBekendmakingenWorkflow,
    beleidsscanStep6SearchRechtspraakWorkflow,
    beleidsscanStep7CommonCrawlWorkflow,
    beleidsscanStep9MergeScoreWorkflow,
    dsoLocationSearchWorkflow
} from '../../workflows/predefinedWorkflows.js';

/**
 * Get a predefined workflow by its ID.
 * 
 * This function provides a single source of truth for workflow lookup.
 * It maps workflow IDs to their corresponding workflow definitions.
 * 
 * @param id - The workflow ID (e.g., 'standard-scan', 'beleidsscan-wizard')
 * @returns The workflow definition if found, null otherwise
 */
export function getWorkflowById(id: string): Workflow | null {
    switch (id) {
        case 'iplo-exploration':
            return explorationWorkflow;
        case 'standard-scan':
            return standardScanWorkflow;
        case 'quick-iplo-scan':
            return quickIploScanWorkflow;
        case 'external-links-exploration':
            return externalLinksWorkflow;
        case 'beleidsscan-graph':
            return beleidsscanGraphWorkflow;
        case 'bfs-3-hop':
            return bfs3HopWorkflow;
        case 'horst-aan-de-maas':
            return horstAanDeMaasWorkflow;
        case 'horst-labor-migration':
            return horstLaborMigrationWorkflow;
        case 'beleidsscan-wizard':
            return beleidsscanWizardWorkflow;
        case 'beleidsscan-step-1-search-dso':
            return beleidsscanStep1SearchDsoWorkflow;
        case 'beleidsscan-step-2-enrich-dso':
            return beleidsscanStep2EnrichDsoWorkflow;
        case 'beleidsscan-step-3-search-iplo':
            return beleidsscanStep3SearchIploWorkflow;
        case 'beleidsscan-step-4-scan-sources':
            return beleidsscanStep4ScanKnownSourcesWorkflow;
        case 'beleidsscan-step-5-officiele-bekendmakingen':
            return beleidsscanStep5SearchOfficieleBekendmakingenWorkflow;
        case 'beleidsscan-step-6-rechtspraak':
            return beleidsscanStep6SearchRechtspraakWorkflow;
        case 'beleidsscan-step-7-common-crawl':
            return beleidsscanStep7CommonCrawlWorkflow;
        case 'beleidsscan-step-9-merge-score':
            return beleidsscanStep9MergeScoreWorkflow;
        case 'dso-location-search':
            return dsoLocationSearchWorkflow;
        default:
            return null;
    }
}
