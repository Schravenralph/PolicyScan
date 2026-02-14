import type { TemplateContext } from '../../../types/template.js';
import type { WorkflowOutput } from '../WorkflowOutputService.js';

/**
 * Builds template context from workflow output
 */
export class TemplateContextBuilder {
  /**
   * Create template context from output
   */
  createTemplateContext(output: WorkflowOutput, context: Record<string, unknown>): TemplateContext {
    return {
      metadata: output.metadata,
      parameters: output.parameters,
      trace: output.trace,
      results: output.results,
      errors: output.errors,
      summary: output.results.summary,
      documents: output.results.documents,
      endpoints: output.results.endpoints,
      ...context
    };
  }

  /**
   * Get list of available variables for templates
   */
  getAvailableVariables(): string[] {
    return [
      'metadata',
      'metadata.runId',
      'metadata.workflowId',
      'metadata.workflowName',
      'metadata.status',
      'metadata.startTime',
      'metadata.endTime',
      'parameters',
      'trace',
      'trace.workflowName',
      'trace.status',
      'trace.steps',
      'results',
      'results.summary',
      'results.summary.totalPages',
      'results.summary.totalDocuments',
      'results.summary.newlyDiscovered',
      'results.documents',
      'results.endpoints',
      'errors'
    ];
  }
}



