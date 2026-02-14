import type { Run } from '../../infrastructure/types.js';
import type { WorkflowTrace, WorkflowTraceStep } from '../WorkflowOutputService.js';

/**
 * Builds workflow trace from run logs
 */
export class WorkflowTraceBuilder {
  /**
   * Build the workflow trace from logs
   */
  buildTrace(run: Run): WorkflowTrace {
    const logs = run.logs || [];
    const steps: WorkflowTraceStep[] = [];
    let currentStep: WorkflowTraceStep | null = null;
    const visitedUrls = new Set<string>();

    for (const log of logs) {
      const message = log.message;

      // Detect step start
      if (message.startsWith('Executing step:')) {
        if (currentStep) {
          currentStep.endTime = log.timestamp.toISOString();
          steps.push(currentStep);
        }

        const match = message.match(/Executing step: (.+) \((.+)\)/);
        currentStep = {
          stepId: match?.[1] || 'unknown',
          stepName: match?.[1] || 'unknown',
          action: match?.[2] || 'unknown',
          startTime: log.timestamp.toISOString(),
          status: 'success',
          urls: []
        };
      }

      // Detect step completion
      if (message.startsWith('Step completed:') && currentStep) {
        currentStep.endTime = log.timestamp.toISOString();
        currentStep.status = 'success';
      }

      // Detect step failure
      if (message.startsWith('Step failed:') && currentStep) {
        currentStep.endTime = log.timestamp.toISOString();
        currentStep.status = 'failed';
      }

      // Extract URLs from logs
      const urlMatch = message.match(/https?:\/\/[^\s]+/g);
      if (urlMatch) {
        urlMatch.forEach((url: string) => {
          visitedUrls.add(url);
          if (currentStep) {
            currentStep.urls = currentStep.urls || [];
            if (!currentStep.urls.includes(url)) {
              currentStep.urls.push(url);
            }
          }
        });
      }

      // Extract exploration/crawl info
      if (message.includes('Exploring:') || message.includes('Crawling:')) {
        const urlFromLog = message.match(/(?:Exploring|Crawling): (https?:\/\/[^\s]+)/);
        if (urlFromLog?.[1]) {
          visitedUrls.add(urlFromLog[1]);
          if (currentStep) {
            currentStep.urls = currentStep.urls || [];
            if (!currentStep.urls.includes(urlFromLog[1])) {
              currentStep.urls.push(urlFromLog[1]);
            }
          }
        }
      }
    }

    // Push last step if exists
    if (currentStep) {
      if (!currentStep.endTime) {
        currentStep.endTime = new Date().toISOString();
      }
      steps.push(currentStep);
    }

    // Map RunStatus to WorkflowTrace status (handle 'pending' and 'paused')
    const traceStatus: WorkflowTrace['status'] = 
      run.status === 'completed' ? 'completed' :
      run.status === 'failed' ? 'failed' :
      run.status === 'cancelled' ? 'cancelled' :
      'running'; // 'pending', 'paused', or 'running' all map to 'running'

    return {
      workflowId: String(run.params?.workflowId || 'unknown'),
      workflowName: String(run.params?.workflowName || run.type || 'unknown'),
      runId: run._id?.toString() || 'unknown',
      startTime: (run.startTime || new Date()).toISOString(),
      endTime: run.endTime ? run.endTime.toISOString() : undefined,
      status: traceStatus,
      steps,
      totalUrlsVisited: visitedUrls.size,
      totalDocumentsFound: 0  // Will be updated from results
    };
  }
}



