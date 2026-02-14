import type { Run } from '../../infrastructure/types.js';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import { WorkflowTraceBuilder } from './WorkflowTraceBuilder.js';
import { WorkflowResultsBuilder } from './WorkflowResultsBuilder.js';
import { WorkflowErrorExtractor } from './WorkflowErrorExtractor.js';

/**
 * Main builder orchestrator for workflow output
 */
export class WorkflowOutputBuilder {
  private traceBuilder: WorkflowTraceBuilder;
  private resultsBuilder: WorkflowResultsBuilder;
  private errorExtractor: WorkflowErrorExtractor;

  constructor() {
    this.traceBuilder = new WorkflowTraceBuilder();
    this.resultsBuilder = new WorkflowResultsBuilder();
    this.errorExtractor = new WorkflowErrorExtractor();
  }

  /**
   * Build the output structure from run data
   */
  buildOutput(run: Run, context: Record<string, unknown>): WorkflowOutput {
    const runId = run._id?.toString() || 'unknown';
    const workflowId = String(run.params?.workflowId || 'unknown');
    const workflowName = String(run.params?.workflowName || run.type || 'unknown');

    // Extract trace from logs
    const trace = this.traceBuilder.buildTrace(run);

    // Extract results from context
    const results = this.resultsBuilder.buildResults(context);

    // Update trace with actual document count from results
    trace.totalDocumentsFound = results.summary.totalDocuments;

    // Extract errors from logs
    const errors = this.errorExtractor.extractErrors(run.logs || []);

    return {
      metadata: {
        runId,
        workflowId: String(workflowId),
        workflowName: String(workflowName),
        startTime: (run.startTime || new Date()).toISOString(),
        endTime: run.endTime ? run.endTime.toISOString() : undefined,
        status: String(run.status),
        version: '1.0.0'
      },
      parameters: run.params || {},
      trace,
      results,
      errors
    };
  }
}



