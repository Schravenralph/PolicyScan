import type { WorkflowMetricsService } from './WorkflowMetricsService.js';
import type { WorkflowAlertService } from './WorkflowAlertService.js';
import type { WorkflowHistoryService } from './WorkflowHistoryService.js';
import type { WorkflowOutputService } from './WorkflowOutputService.js';
import type { ServiceValidationService } from './ServiceValidationService.js';
import type { ServiceConfigurationValidator } from './ServiceConfigurationValidator.js';
import type { DeadLetterQueueService } from './DeadLetterQueueService.js';
import type { WorkflowTransactionService } from './WorkflowTransactionService.js';
import type { NotificationService } from '../NotificationService.js';
import type { ProgressStreamingService } from '../progress/ProgressStreamingService.js';
import type { QueueService } from '../infrastructure/QueueService.js';
import type { TimeoutErrorFormatter } from '../../utils/TimeoutErrorFormatter.js';
import { ReviewService } from '../review/ReviewService.js';
import type { Env } from '../../config/env.js';
import type { WorkflowOrchestrator } from '../orchestration/WorkflowOrchestrator.js';

export { ReviewService };
export type ReviewServiceClass = typeof ReviewService;

export interface WorkflowDependencies {
  getQueueService(): Promise<QueueService>;
  getMetricsService(): Promise<WorkflowMetricsService>;
  getAlertService(): Promise<WorkflowAlertService>;
  getProgressStreamingService(): Promise<ProgressStreamingService>;
  getNotificationService(): Promise<NotificationService>;
  getHistoryService(): Promise<WorkflowHistoryService>;
  getServiceValidationService(): Promise<ServiceValidationService>;
  getWorkflowOutputService(): Promise<WorkflowOutputService>;
  getTimeoutErrorFormatter(): Promise<TimeoutErrorFormatter>;
  getPerformanceConfigUtils(): Promise<{ initializePerformanceConfigInContext: (context: Record<string, unknown>, params: Record<string, unknown>) => unknown }>;
  getServiceConfigurationValidator(): Promise<ServiceConfigurationValidator>;
  getReviewServiceClass(): Promise<ReviewServiceClass>;
  getDeadLetterQueueService(): Promise<DeadLetterQueueService>;
  getTransactionService(): Promise<WorkflowTransactionService>;
  getEnv(): Promise<Env>;
  getWorkflowOrchestrator(): Promise<WorkflowOrchestrator>;
}

export class DefaultWorkflowDependencies implements WorkflowDependencies {
  async getQueueService(): Promise<QueueService> {
    const { getQueueService } = await import('../infrastructure/QueueService.js');
    return getQueueService();
  }

  async getMetricsService(): Promise<WorkflowMetricsService> {
    const { getWorkflowMetricsService } = await import('./WorkflowMetricsService.js');
    return getWorkflowMetricsService();
  }

  async getAlertService(): Promise<WorkflowAlertService> {
    const { getWorkflowAlertService } = await import('./WorkflowAlertService.js');
    return getWorkflowAlertService();
  }

  async getProgressStreamingService(): Promise<ProgressStreamingService> {
    const { getProgressStreamingService } = await import('../progress/ProgressStreamingService.js');
    return getProgressStreamingService();
  }

  async getNotificationService(): Promise<NotificationService> {
    const { getNotificationService } = await import('../NotificationService.js');
    return getNotificationService();
  }

  async getHistoryService(): Promise<WorkflowHistoryService> {
    const { getWorkflowHistoryService } = await import('./WorkflowHistoryService.js');
    return getWorkflowHistoryService();
  }

  async getServiceValidationService(): Promise<ServiceValidationService> {
    const { getServiceValidationService } = await import('./ServiceValidationService.js');
    return getServiceValidationService();
  }

  async getWorkflowOutputService(): Promise<WorkflowOutputService> {
    const { getWorkflowOutputService } = await import('./WorkflowOutputService.js');
    return getWorkflowOutputService();
  }

  async getTimeoutErrorFormatter(): Promise<TimeoutErrorFormatter> {
    const { getTimeoutErrorFormatter } = await import('../../utils/TimeoutErrorFormatter.js');
    return getTimeoutErrorFormatter();
  }

  async getPerformanceConfigUtils(): Promise<{ initializePerformanceConfigInContext: (context: Record<string, unknown>, params: Record<string, unknown>) => unknown }> {
    return await import('../../utils/performanceConfig.js');
  }

  async getServiceConfigurationValidator(): Promise<ServiceConfigurationValidator> {
    const { ServiceConfigurationValidator } = await import('./ServiceConfigurationValidator.js');
    return new ServiceConfigurationValidator();
  }

  async getReviewServiceClass(): Promise<ReviewServiceClass> {
    const { ReviewService } = await import('../review/ReviewService.js');
    return ReviewService;
  }

  async getDeadLetterQueueService(): Promise<DeadLetterQueueService> {
    const { getDeadLetterQueueService } = await import('./DeadLetterQueueService.js');
    return getDeadLetterQueueService();
  }

  async getTransactionService(): Promise<WorkflowTransactionService> {
    const { getWorkflowTransactionService } = await import('./WorkflowTransactionService.js');
    return getWorkflowTransactionService();
  }

  async getEnv(): Promise<Env> {
    const { validateEnv } = await import('../../config/env.js');
    return validateEnv();
  }

  async getWorkflowOrchestrator(): Promise<WorkflowOrchestrator> {
    const { WorkflowOrchestrator } = await import('../orchestration/WorkflowOrchestrator.js');
    const { IngestionOrchestrator } = await import('../ingestion/IngestionOrchestrator.js');
    const { PolicyParser } = await import('../parsing/PolicyParser.js');
    const { RuleEvaluator } = await import('../evaluation/RuleEvaluator.js');
    const { DocumentScorer } = await import('../scoring/DocumentScorer.js');
    const { ReportGenerator } = await import('../reporting/ReportGenerator.js');
    const { LLMService } = await import('../llm/LLMService.js');

    const llmService = new LLMService();
    const ingestionOrchestrator = new IngestionOrchestrator();
    const policyParser = new PolicyParser(llmService);
    const ruleEvaluator = new RuleEvaluator();
    const documentScorer = new DocumentScorer(ruleEvaluator);
    const reportGenerator = new ReportGenerator();

    return new WorkflowOrchestrator(
        ingestionOrchestrator,
        policyParser,
        ruleEvaluator,
        documentScorer,
        reportGenerator
    );
  }
}
