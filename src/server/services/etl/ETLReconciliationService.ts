/**
 * ETL Reconciliation Service
 * 
 * Detects missing graphs in GraphDB and reconciles with ETL run records.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/12-etl-graphdb.md
 */

import { logger } from '../../utils/logger.js';
import { ETLRunModel } from '../../models/ETLRunModel.js';
import { getDocumentGraphUri, getProvenanceGraphUri, graphExists } from '../../etl/loaders/graphdbLoader.js';
import { CanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import type { CanonicalDocument } from '../../contracts/types.js';

/**
 * Reconciliation result
 */
export interface ReconciliationResult {
  runId: string;
  missingDocumentGraphs: string[];
  missingProvenanceGraph: boolean;
  totalDocuments: number;
  documentsWithGraphs: number;
}

/**
 * ETL Reconciliation Service
 */
export class ETLReconciliationService {
  private documentService: CanonicalDocumentService;

  constructor() {
    this.documentService = new CanonicalDocumentService();
  }

  /**
   * Reconcile a single ETL run - check if all expected graphs exist
   */
  async reconcileRun(runId: string): Promise<ReconciliationResult> {
    const run = await ETLRunModel.findByRunId(runId);
    if (!run) {
      throw new Error(`ETL run not found: ${runId}`);
    }

    if (run.state !== 'succeeded') {
      throw new Error(`ETL run is not in succeeded state: ${run.state}`);
    }

    const missingDocumentGraphs: string[] = [];
    let missingProvenanceGraph = false;

    // Check provenance graph
    const provGraphUri = getProvenanceGraphUri(runId);
    const provExists = await graphExists(provGraphUri);
    if (!provExists) {
      missingProvenanceGraph = true;
      logger.warn({ runId, graphUri: provGraphUri }, 'Missing provenance graph');
    }

    // Get document IDs from run
    let documentIds: string[] = [];
    
    if (run.input.documentIds && run.input.documentIds.length > 0) {
      documentIds = run.input.documentIds;
    } else if (run.input.query) {
      // Query documents based on filters
      const documents = await this.documentService.findByQuery(
        run.input.query as any,
        { limit: 10000, skip: 0 }
      );
      documentIds = documents.map((doc: CanonicalDocument) => doc._id);
    }

    // Check each document graph
    for (const documentId of documentIds) {
      const docGraphUri = getDocumentGraphUri(documentId);
      const exists = await graphExists(docGraphUri);
      
      if (!exists) {
        missingDocumentGraphs.push(documentId);
        logger.warn({ runId, documentId, graphUri: docGraphUri }, 'Missing document graph');
      }
    }

    return {
      runId,
      missingDocumentGraphs,
      missingProvenanceGraph,
      totalDocuments: documentIds.length,
      documentsWithGraphs: documentIds.length - missingDocumentGraphs.length,
    };
  }

  /**
   * Reconcile all succeeded ETL runs
   */
  async reconcileAllRuns(): Promise<ReconciliationResult[]> {
    const succeededRuns = await ETLRunModel.find({ state: 'succeeded' });
    const results: ReconciliationResult[] = [];

    for (const run of succeededRuns) {
      try {
        const result = await this.reconcileRun(run.runId);
        results.push(result);
      } catch (error) {
        logger.error(
          { runId: run.runId, error: error instanceof Error ? error.message : String(error) },
          'Failed to reconcile ETL run'
        );
        // Continue with next run
      }
    }

    return results;
  }

  /**
   * Find all documents that should have graphs but don't
   */
  async findMissingGraphs(): Promise<{
    documentIds: string[];
    runIds: string[];
  }> {
    const succeededRuns = await ETLRunModel.find({ state: 'succeeded' });
    const missingDocumentIds = new Set<string>();
    const affectedRunIds: string[] = [];

    for (const run of succeededRuns) {
      try {
        const reconciliation = await this.reconcileRun(run.runId);
        
        if (reconciliation.missingDocumentGraphs.length > 0 || reconciliation.missingProvenanceGraph) {
          affectedRunIds.push(run.runId);
          reconciliation.missingDocumentGraphs.forEach(id => missingDocumentIds.add(id));
        }
      } catch (error) {
        logger.error({ runId: run.runId, error }, 'Failed to check run for missing graphs');
      }
    }

    return {
      documentIds: Array.from(missingDocumentIds),
      runIds: affectedRunIds,
    };
  }
}

