/**
 * Workflow Formatters
 *
 * Explicit mapping from domain values (workflow status) to translated strings.
 * This enforces the separation between domain data and presentation.
 */
/**
 * Workflow status type (domain value)
 */
export type WorkflowStatus = 'Draft' | 'Testing' | 'Tested' | 'Published' | 'Unpublished' | 'Deprecated';
/**
 * Format workflow status to translated string
 *
 * @param status - Workflow status string (case-insensitive, handles underscores)
 * @returns Translated string (e.g., "Concept", "Gepubliceerd")
 */
export declare function formatWorkflowStatus(status: string): string;
