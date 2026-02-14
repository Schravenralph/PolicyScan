/**
 * WizardResult - Canonical, versioned result object for wizard sessions
 *
 * This type provides a structured representation of a wizard session's state and results,
 * aggregating wizard step state and linking to query/run. It can be consumed by frontend
 * and downstream systems.
 *
 * The WizardResult type is designed to be:
 * - Versioned: Includes wizard definition id and version
 * - Complete: Aggregates all step results and context
 * - Linked: References related Query and Run entities
 * - Deterministic: Provides stable structure for E2E testing and API responses
 */
/**
 * Wizard session status
 */
export type WizardResultStatus = 'active' | 'completed' | 'failed' | 'abandoned';
/**
 * Step result status
 */
export type StepResultStatus = 'pending' | 'completed' | 'failed';
/**
 * Step result structure
 */
export interface StepResult {
    stepId: string;
    stepName: string;
    status: StepResultStatus;
    completedAt?: Date;
    output?: Record<string, unknown>;
}
/**
 * Wizard summary information
 */
export interface WizardSummary {
    totalSteps: number;
    completedSteps: number;
    currentStepId?: string;
    status: WizardResultStatus;
}
/**
 * Wizard definition reference
 */
export interface WizardDefinitionReference {
    id: string;
    version: number;
}
/**
 * WizardResult - Canonical result object for wizard sessions
 *
 * This interface provides a complete, versioned representation of a wizard session's
 * state and results. It aggregates:
 * - Session identification (sessionId, wizard definition)
 * - Summary information (total steps, completed steps, current step, status)
 * - Step results (per-step status, completion time, outputs)
 * - Linked entities (queryId, runId)
 * - Final context (all context data from the session)
 */
export interface WizardResult {
    /**
     * Unique session identifier
     */
    sessionId: string;
    /**
     * Wizard definition reference (id and version)
     */
    wizard: WizardDefinitionReference;
    /**
     * Summary of wizard progress
     */
    summary: WizardSummary;
    /**
     * Array of step results, one per step in the wizard
     */
    stepResults: StepResult[];
    /**
     * Linked Query ID (if query was created)
     */
    linkedQueryId?: string;
    /**
     * Linked Run ID (if workflow run was started)
     */
    linkedRunId?: string;
    /**
     * Final context from the wizard session
     * Contains all context data accumulated during wizard execution
     */
    finalContext: Record<string, unknown>;
}
