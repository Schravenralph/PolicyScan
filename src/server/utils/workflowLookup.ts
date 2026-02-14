/**
 * Workflow Lookup Utility
 * 
 * Provides a centralized way to look up workflows by ID from predefined workflows
 * or the database. Used by benchmark and comparison services.
 */

import type { Workflow } from '../services/infrastructure/types.js';
import {
  explorationWorkflow,
  standardScanWorkflow,
  quickIploScanWorkflow,
  externalLinksWorkflow,
  beleidsscanGraphWorkflow,
  bfs3HopWorkflow,
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
  dsoLocationSearchWorkflow,
} from '../workflows/predefinedWorkflows.js';

/**
 * Get workflow by ID from predefined workflows or database
 */
export async function getWorkflowById(id: string): Promise<Workflow | null> {
  // Check predefined workflows first
  const predefinedWorkflow = getPredefinedWorkflowById(id);
  if (predefinedWorkflow) {
    return predefinedWorkflow;
  }

  // Check database using version-aware loading
  try {
    const { WorkflowModel } = await import('../models/Workflow.js');
    // Use version-aware loading: get latest published version if available, otherwise current version
    let workflowDoc = await WorkflowModel.getLatestPublishedVersion(id);
    if (!workflowDoc) {
      // Fallback to current version if no published version exists
      workflowDoc = await WorkflowModel.findById(id);
    }
    if (workflowDoc) {
      return {
        id: workflowDoc.id,
        name: workflowDoc.name,
        description: workflowDoc.description,
        steps: workflowDoc.steps,
      };
    }
  } catch (error) {
    // Database lookup failed, return null
    console.warn(`Failed to lookup workflow ${id} from database:`, error);
  }

  return null;
}

/**
 * Get predefined workflow by ID
 */
function getPredefinedWorkflowById(id: string): Workflow | null {
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
    // Benchmark workflows - single-step workflows for performance testing
    case 'beleidsscan-wizard-step1-search-dso':
      return beleidsscanStep1SearchDsoWorkflow;
    case 'beleidsscan-wizard-step2-enrich-dso':
      return beleidsscanStep2EnrichDsoWorkflow;
    case 'beleidsscan-wizard-step3-search-iplo':
      return beleidsscanStep3SearchIploWorkflow;
    case 'beleidsscan-wizard-step4-scan-known-sources':
    case 'beleidsscan-step-4-scan-sources':
      return beleidsscanStep4ScanKnownSourcesWorkflow;
    case 'beleidsscan-wizard-step5-search-officielebekendmakingen':
      return beleidsscanStep5SearchOfficieleBekendmakingenWorkflow;
    case 'beleidsscan-wizard-step6-search-rechtspraak':
      return beleidsscanStep6SearchRechtspraakWorkflow;
    case 'beleidsscan-wizard-step7-search-common-crawl':
      return beleidsscanStep7CommonCrawlWorkflow;
    case 'beleidsscan-wizard-step9-merge-score':
      return beleidsscanStep9MergeScoreWorkflow;
    case 'dso-location-search':
      return dsoLocationSearchWorkflow;
    default:
      return null;
  }
}

/**
 * Get workflow name by ID
 */
export async function getWorkflowNameById(id: string): Promise<string | null> {
  const workflow = await getWorkflowById(id);
  return workflow?.name || null;
}

