/**
 * Wizard API Service
 * 
 * Provides methods for interacting with wizard session APIs.
 */

import { BaseApiService } from './BaseApiService.js';

/**
 * Wizard session document structure
 */
export interface WizardSession {
  sessionId: string;
  wizardDefinitionId: string;
  wizardDefinitionVersion: number;
  currentStepId: string;
  completedSteps: string[];
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  context: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Wizard state for deterministic testing
 */
export interface WizardState {
  sessionId: string;
  wizardDefinition: { id: string; version: number };
  currentStepId: string;
  completedSteps: string[];
  status: string;
  context: Record<string, unknown>;
  navigationHistory: Array<{
    stepId: string;
    timestamp: string;
    direction: 'forward' | 'back' | 'jump';
  }>;
  linkedQueryId?: string;
  linkedRunId?: string;
  revision: number;
  updatedAt: string;
}

/**
 * Create session request
 */
export interface CreateSessionRequest {
  wizardDefinitionId: string;
  wizardDefinitionVersion?: number;
}

/**
 * Navigate request
 */
export interface NavigateRequest {
  targetStepId: string;
  revision?: number;
}

/**
 * Validate input request
 */
export interface ValidateInputRequest {
  input: unknown;
  revision?: number;
}

/**
 * Execute action request
 */
export interface ExecuteActionRequest {
  input: unknown;
  revision?: number;
}

/**
 * Validate input response
 */
export interface ValidateInputResponse {
  valid: boolean;
  errors?: Array<{
    path: (string | number)[];
    message: string;
  }>;
}

/**
 * Execute action response
 */
export interface ExecuteActionResponse {
  output: unknown;
  contextUpdates?: Record<string, unknown>;
}

/**
 * WizardResult types (mirrored from server for client use)
 * Note: These should match the server types in src/server/types/WizardResult.ts
 */
export type WizardResultStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type StepResultStatus = 'pending' | 'completed' | 'failed';

export interface StepResult {
  stepId: string;
  stepName: string;
  status: StepResultStatus;
  completedAt?: string;
  output?: Record<string, unknown>;
}

export interface WizardSummary {
  totalSteps: number;
  completedSteps: number;
  currentStepId?: string;
  status: WizardResultStatus;
}

export interface WizardDefinitionReference {
  id: string;
  version: number;
}

export interface WizardResult {
  sessionId: string;
  wizard: WizardDefinitionReference;
  summary: WizardSummary;
  stepResults: StepResult[];
  linkedQueryId?: string;
  linkedRunId?: string;
  finalContext: Record<string, unknown>;
}

/**
 * Wizard API Service
 */
export class WizardApiService extends BaseApiService {
  /**
   * Create a new wizard session
   */
  async createSession(request: CreateSessionRequest): Promise<WizardSession> {
    const response = await this.post<{ session: WizardSession }>(
      '/wizard/sessions',
      request
    );
    return response.session;
  }

  /**
   * Get wizard session state (for E2E testing and debugging)
   */
  async getSessionState(sessionId: string): Promise<WizardState> {
    const response = await this.get<{ state: WizardState }>(
      `/wizard/sessions/${sessionId}/state`
    );
    return response.state;
  }

  /**
   * Navigate to a target step
   */
  async navigate(sessionId: string, request: NavigateRequest): Promise<WizardSession> {
    const response = await this.post<{ session: WizardSession }>(
      `/wizard/sessions/${sessionId}/navigate`,
      request
    );
    return response.session;
  }

  /**
   * Validate step input
   */
  async validateInput(
    sessionId: string,
    stepId: string,
    request: ValidateInputRequest
  ): Promise<ValidateInputResponse> {
    return this.post<ValidateInputResponse>(
      `/wizard/sessions/${sessionId}/steps/${stepId}/validate`,
      request
    );
  }

  /**
   * Execute a step action
   */
  async executeAction(
    sessionId: string,
    stepId: string,
    actionId: string,
    request: ExecuteActionRequest
  ): Promise<ExecuteActionResponse> {
    return this.post<ExecuteActionResponse>(
      `/wizard/sessions/${sessionId}/steps/${stepId}/actions/${actionId}/execute`,
      request
    );
  }

  /**
   * Mark a step as completed
   */
  async markStepCompleted(
    sessionId: string,
    stepId: string,
    output: unknown,
    revision?: number
  ): Promise<WizardSession> {
    const response = await this.post<{ session: WizardSession }>(
      `/wizard/sessions/${sessionId}/steps/${stepId}/complete`,
      {
        output,
        revision,
      }
    );
    return response.session;
  }

  /**
   * Get WizardResult for a session (for final summary/export)
   */
  async getResult(sessionId: string): Promise<WizardResult> {
    const response = await this.get<{ result: WizardResult }>(
      `/wizard/sessions/${sessionId}/result`
    );
    return response.result;
  }

  /**
   * Get wizard service health status
   */
  async getHealth(): Promise<{ healthy: boolean; message?: string }> {
    try {
      return await this.get<{ healthy: boolean; message?: string }>('/wizard/health');
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Wizard service unavailable',
      };
    }
  }
}

