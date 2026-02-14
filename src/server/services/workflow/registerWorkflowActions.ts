/**
 * Shared utility for registering all workflow actions
 * 
 * This function centralizes workflow action registration so it can be reused
 * in both the HTTP router (createWorkflowRouter) and the job processor
 * (WorkflowJobProcessor). This ensures actions are available regardless of
 * how workflows are executed.
 * 
 * @param workflowEngine - Workflow engine instance to register actions with
 * @param runManager - Run manager instance
 * @param navigationGraph - Optional navigation graph instance (for graph-based actions)
 */

import { WorkflowEngine } from './WorkflowEngine.js';
import { RunManager } from './RunManager.js';
import { NavigationGraph } from '../graphs/navigation/NavigationGraph.js';
import { logger } from '../../utils/logger.js';

export async function registerAllWorkflowActions(
    workflowEngine: WorkflowEngine,
    runManager: RunManager,
    navigationGraph?: NavigationGraph | null
): Promise<void> {
    try {
        // Register DSO actions
        const { registerDSOActions } = await import('../../routes/workflows/actions/dso/index.js');
        registerDSOActions(workflowEngine, runManager, navigationGraph);

        // Register IPLO actions
        const { registerIPLOActions } = await import('../../routes/workflows/actions/iploActions.js');
        registerIPLOActions(workflowEngine, runManager, navigationGraph);

        // Register scraping actions
        const { registerScrapingActions } = await import('../../routes/workflows/actions/scrapingActions.js');
        registerScrapingActions(workflowEngine, runManager, navigationGraph);

        // Register processing actions
        const { registerProcessingActions } = await import('../../routes/workflows/actions/processingActions.js');
        registerProcessingActions(workflowEngine, runManager);

        // Register external actions
        const { registerExternalActions } = await import('../../routes/workflows/actions/externalActions.js');
        registerExternalActions(workflowEngine, runManager, navigationGraph);

        // Register Common Crawl actions
        const { registerCommonCrawlActions } = await import('../../routes/workflows/actions/commonCrawlActions.js');
        registerCommonCrawlActions(workflowEngine, runManager, navigationGraph || undefined);

        // Register query actions
        const { registerQueryActions } = await import('../../routes/workflows/actions/queryActions.js');
        registerQueryActions(workflowEngine, runManager);

        // Register Google actions
        // Registered unconditionally to allow workflows to pass validation even if graph is unavailable
        const { registerGoogleActions } = await import('../../routes/workflows/actions/googleActions.js');
        registerGoogleActions(workflowEngine, runManager, navigationGraph);

        // Register graph actions
        // Registered unconditionally to allow workflows to pass validation even if graph is unavailable
        const { registerGraphActions } = await import('../../routes/workflows/actions/graphActions.js');
        registerGraphActions(workflowEngine, runManager, navigationGraph);

        const { registerBFSActions } = await import('../../routes/workflows/actions/bfsActions.js');
        registerBFSActions(workflowEngine, runManager, navigationGraph);

        const { registerExplorationActions } = await import('../../routes/workflows/actions/explorationActions.js');
        registerExplorationActions(workflowEngine, runManager, navigationGraph);

        // Register compensation actions (async, non-blocking)
        try {
            const { registerCompensationActions } = await import('./compensation/compensationActions.js');
            registerCompensationActions(workflowEngine);
        } catch (error) {
            logger.warn({ error }, 'Failed to register compensation actions (compensation may not be available)');
        }

        logger.info('Registered all workflow actions');
    } catch (error) {
        logger.error({ error }, 'Failed to register some workflow actions');
        throw error;
    }
}

