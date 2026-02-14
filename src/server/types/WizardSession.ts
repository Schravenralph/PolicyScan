import { ObjectId } from 'mongodb';

/**
 * Wizard step IDs for the Beleidsscan wizard
 */
export type WizardStepId = 'query-configuration' | 'website-selection' | 'document-review';

/**
 * Wizard session status
 */
export type WizardSessionStatus = 'active' | 'completed' | 'failed' | 'abandoned';

/**
 * WizardSession document structure
 */
export interface WizardSessionDocument {
  _id?: ObjectId;
  sessionId: string;
  wizardDefinitionId: string; // e.g. 'beleidsscan-wizard'
  wizardDefinitionVersion: number;
  currentStepId: WizardStepId;
  completedSteps: string[];
  context: Record<string, unknown>; // queryId, selectedWebsites, decisions, etc.
  linkedQueryId?: ObjectId;
  linkedRunId?: string;
  status: WizardSessionStatus;
  revision: number; // optimistic locking
  createdAt: Date;
  updatedAt: Date;
}

/**
 * WizardSession creation input
 */
export interface WizardSessionCreateInput {
  sessionId: string;
  wizardDefinitionId: string;
  wizardDefinitionVersion: number;
  currentStepId?: WizardStepId;
  completedSteps?: string[];
  context?: Record<string, unknown>;
  linkedQueryId?: string;
  linkedRunId?: string;
  status?: WizardSessionStatus;
}

/**
 * WizardSession update input
 */
export interface WizardSessionUpdateInput {
  currentStepId?: WizardStepId;
  completedSteps?: string[];
  context?: Record<string, unknown>;
  linkedQueryId?: string;
  linkedRunId?: string;
  status?: WizardSessionStatus;
  revision?: number; // Required for optimistic locking
}

