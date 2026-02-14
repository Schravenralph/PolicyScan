/**
 * Workflow-Wizard Integration Service
 *
 * Provides health checks, parameter validation, and result validation
 * for the workflow-wizard integration.
 */
import type { Run, WorkflowOutput } from '../api';
export interface WorkflowExecutionParams {
    queryId: string;
    websiteIds?: string[];
    onderwerp: string;
    overheidslaag?: string;
    overheidsinstantie?: string;
    [key: string]: unknown;
}
export interface IntegrationHealthStatus {
    healthy: boolean;
    timestamp: string;
    checks: {
        workflowService: {
            healthy: boolean;
            message?: string;
        };
        wizardService: {
            healthy: boolean;
            message?: string;
        };
        integration: {
            healthy: boolean;
            message?: string;
        };
    };
}
export interface ParameterValidationResult {
    valid: boolean;
    errors?: Record<string, string>;
}
export interface ResultValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
}
export declare class WorkflowWizardIntegrationService {
    /**
     * Check integration health
     */
    static checkHealth(): Promise<IntegrationHealthStatus>;
    /**
     * Check workflow service health
     */
    private static checkWorkflowService;
    /**
     * Check wizard service health
     */
    private static checkWizardService;
    /**
     * Check integration health (both services working together)
     */
    private static checkIntegration;
    /**
     * Validate workflow execution parameters
     */
    static validateParameters(params: WorkflowExecutionParams): ParameterValidationResult;
    /**
     * Validate workflow result
     */
    static validateResult(result: WorkflowOutput | Run): ResultValidationResult;
    /**
     * Quick health check (returns boolean)
     */
    static quickHealthCheck(): Promise<boolean>;
}
