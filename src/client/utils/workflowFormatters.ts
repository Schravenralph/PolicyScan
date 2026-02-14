/**
 * Workflow Formatters
 * 
 * Explicit mapping from domain values (workflow status) to translated strings.
 * This enforces the separation between domain data and presentation.
 */

import { t, type TranslationKey } from './i18n.js';

/**
 * Workflow status type (domain value)
 */
export type WorkflowStatus = 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';

/**
 * Mapping from workflow status to translation key
 */
const workflowStatusLabelKey: Record<WorkflowStatus, TranslationKey> = {
  Draft: 'workflowStatus.draft',
  Testing: 'workflowStatus.testing',
  Tested: 'workflowStatus.tested',
  Published: 'workflowStatus.published',
  Unpublished: 'workflowStatus.unpublished',
  Deprecated: 'workflowStatus.deprecated',
} as const;

/**
 * Format workflow status to translated string
 * 
 * @param status - Workflow status string (case-insensitive, handles underscores)
 * @returns Translated string (e.g., "Concept", "Gepubliceerd")
 */
export function formatWorkflowStatus(status: string): string {
  // Normalize status: lowercase and replace underscores
  const normalized = status.toLowerCase().replace(/_/g, '');
  
  // Map normalized status to WorkflowStatus type
  const statusMap: Record<string, WorkflowStatus> = {
    'draft': 'Draft',
    'testing': 'Testing',
    'tested': 'Tested',
    'published': 'Published',
    'unpublished': 'Unpublished',
    'deprecated': 'Deprecated',
  };
  
  const workflowStatus = statusMap[normalized];
  if (workflowStatus) {
    const key = workflowStatusLabelKey[workflowStatus];
    return t(key);
  }
  
  // Fallback: return original status if not recognized
  return status;
}
