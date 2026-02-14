/**
 * Workflow Conversion Utilities
 * 
 * Shared utilities for converting between Workflow and WorkflowDocument types.
 * Used to ensure type consistency when returning workflows from API endpoints.
 */

import { logger } from './logger.js';
import type { Workflow } from '../services/infrastructure/types.js';

/**
 * WorkflowDocument format for API responses (matches client-side WorkflowDocument interface)
 * Dates are ISO strings for JSON serialization
 */
export interface WorkflowDocumentApi {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    id: string;
    name: string;
    action: string;
    params?: Record<string, unknown>;
    next?: string;
  }>;
  status: 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';
  version: number;
  statusHistory: Array<{
    status: string;
    timestamp: string;
    userId?: string;
    comment?: string;
  }>;
  publishedBy?: string;
  publishedAt?: string;
  testMetrics?: {
    runCount: number;
    acceptanceRate: number;
    errorRate: number;
    lastTestRun?: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/**
 * Converts a predefined Workflow to WorkflowDocumentApi format.
 * Validates required fields and filters invalid steps.
 * 
 * @param wf - Predefined workflow to convert
 * @returns WorkflowDocumentApi with all required fields
 * @throws Error if workflow is missing required fields (id, name)
 */
export function convertPredefinedWorkflowToDocument(wf: Workflow): WorkflowDocumentApi {
  // Validate required fields
  if (!wf.id || !wf.name) {
    throw new Error(`Invalid predefined workflow: missing required fields (id: ${wf.id}, name: ${wf.name})`);
  }
  
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description || '',
    steps: wf.steps.map((step) => {
      if (!step.id || !step.name || !step.action) {
        logger.warn({ workflowId: wf.id, step }, 'Invalid workflow step detected, skipping');
        return null;
      }
      return {
        id: step.id,
        name: step.name,
        action: step.action,
        params: step.params,
        next: step.next,
      };
    }).filter((step): step is NonNullable<typeof step> => step !== null),
    status: 'Published',
    version: 1,
    statusHistory: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * Converts a database WorkflowDocument to WorkflowDocumentApi format.
 * Ensures dates are ISO strings and description is never undefined.
 * 
 * @param wf - Database workflow document
 * @returns WorkflowDocumentApi with consistent format
 */
export function convertDatabaseWorkflowToDocument(wf: {
  id: string;
  name: string;
  description?: string;
  steps: Array<unknown>;
  status: string;
  version: number;
  statusHistory: Array<unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
  publishedBy?: string;
  publishedAt?: Date | string;
  testMetrics?: {
    runCount: number;
    acceptanceRate: number;
    errorRate: number;
    lastTestRun?: Date | string;
  };
  createdBy?: string;
}): WorkflowDocumentApi {
  const steps: WorkflowDocumentApi['steps'] = Array.isArray(wf.steps) 
    ? wf.steps.map((step: unknown) => {
        if (typeof step === 'object' && step !== null) {
          const s = step as Record<string, unknown>;
          return {
            id: String(s.id || ''),
            name: String(s.name || ''),
            action: String(s.action || ''),
            params: s.params as Record<string, unknown> | undefined,
            next: s.next ? String(s.next) : undefined,
          };
        }
        return { id: '', name: '', action: '' };
      })
    : [];

  return {
    ...wf,
    description: wf.description || '',
    status: wf.status as WorkflowDocumentApi['status'],
    steps,
    createdAt: wf.createdAt instanceof Date ? wf.createdAt.toISOString() : wf.createdAt,
    updatedAt: wf.updatedAt instanceof Date ? wf.updatedAt.toISOString() : wf.updatedAt,
    publishedAt: wf.publishedAt instanceof Date ? wf.publishedAt.toISOString() : (wf.publishedAt || undefined),
    testMetrics: wf.testMetrics ? {
      ...wf.testMetrics,
      lastTestRun: wf.testMetrics.lastTestRun instanceof Date 
        ? wf.testMetrics.lastTestRun.toISOString() 
        : (wf.testMetrics.lastTestRun || undefined),
    } : undefined,
    statusHistory: Array.isArray(wf.statusHistory) ? wf.statusHistory.map((entry: unknown) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        return {
          status: String(e.status || ''),
          timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : String(e.timestamp || ''),
          userId: e.userId ? String(e.userId) : undefined,
          comment: e.comment ? String(e.comment) : undefined,
        };
      }
      return { status: '', timestamp: '' };
    }) : [],
  };
}

/**
 * Gets all workflows (database + predefined) as WorkflowDocumentApi[].
 * Handles errors gracefully and continues with available workflows.
 * 
 * @returns Array of workflows in WorkflowDocumentApi format
 */
export async function getAllWorkflowsAsDocuments(): Promise<WorkflowDocumentApi[]> {
  const { WorkflowModel } = await import('../models/Workflow.js');
  const { allPredefinedWorkflows } = await import('../workflows/predefinedWorkflows.js');
  
  let allWorkflows: Array<{
    id: string;
    name: string;
    description?: string;
    steps: Array<unknown>;
    status: string;
    version: number;
    statusHistory: Array<unknown>;
    createdAt: Date | string;
    updatedAt: Date | string;
    publishedBy?: string;
    publishedAt?: Date | string;
    testMetrics?: {
      runCount: number;
      acceptanceRate: number;
      errorRate: number;
      lastTestRun?: Date | string;
    };
    createdBy?: string;
  }> = [];
  
  try {
    allWorkflows = await WorkflowModel.findAll();
  } catch (error) {
    logger.warn({ error }, 'Failed to load workflows from database, continuing with predefined workflows only');
  }
  
  // Convert predefined workflows to WorkflowDocumentApi format
  const predefinedAsDocuments = allPredefinedWorkflows.map((wf) => {
    try {
      return convertPredefinedWorkflowToDocument(wf);
    } catch (error) {
      logger.error({ error, workflowId: wf.id }, 'Failed to convert predefined workflow to document format');
      return null;
    }
  }).filter((wf): wf is WorkflowDocumentApi => wf !== null);
  
  // Convert database workflows to ensure consistent format
  const dbWorkflowsAsDocuments = allWorkflows.map((wf) => convertDatabaseWorkflowToDocument(wf));
  
  // Deduplicate workflows by ID: database workflows take precedence over predefined ones
  // This prevents duplicate workflow IDs from being returned to the frontend
  const workflowMap = new Map<string, WorkflowDocumentApi>();
  
  // Add predefined workflows first (lower priority)
  predefinedAsDocuments.forEach(wf => {
    if (wf.id && !workflowMap.has(wf.id)) {
      workflowMap.set(wf.id, wf);
    }
  });
  
  // Add database workflows (higher priority - will overwrite predefined if same ID exists)
  dbWorkflowsAsDocuments.forEach(wf => {
    if (wf.id) {
      workflowMap.set(wf.id, wf);
    }
  });
  
  return Array.from(workflowMap.values());
}

/**
 * Gets only predefined workflows as WorkflowDocumentApi[] (fallback).
 * Used when database is unavailable.
 * 
 * @returns Array of predefined workflows in WorkflowDocumentApi format
 */
export async function getPredefinedWorkflowsAsDocuments(): Promise<WorkflowDocumentApi[]> {
  const { allPredefinedWorkflows } = await import('../workflows/predefinedWorkflows.js');
  
  // Convert predefined workflows to WorkflowDocumentApi format
  return allPredefinedWorkflows.map((wf) => {
    try {
      return convertPredefinedWorkflowToDocument(wf);
    } catch (error) {
      logger.error({ error, workflowId: wf.id }, 'Failed to convert predefined workflow to document format');
      return null;
    }
  }).filter((wf): wf is WorkflowDocumentApi => wf !== null);
}

