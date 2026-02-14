/**
 * Workflow Templates Library
 * 
 * Central export for all workflow templates
 */

export * from './policy-scan-template.js';
export * from './data-processing-template.js';

/**
 * Template registry - maps template IDs to factory functions
 */
export const templateRegistry = {
  'policy-scan': {
    name: 'Policy Scan Template',
    description: 'Template for scanning policy documents from various sources',
    create: (await import('./policy-scan-template.js')).createPolicyScanWorkflow
  },
  'data-processing': {
    name: 'Data Processing Template',
    description: 'Template for processing and analyzing scraped data',
    create: (await import('./data-processing-template.js')).createDataProcessingWorkflow
  }
};

/**
 * Get available template IDs
 */
export function getAvailableTemplateIds(): string[] {
  return Object.keys(templateRegistry);
}

/**
 * Get template info by ID
 */
export function getTemplateInfo(templateId: string) {
  return templateRegistry[templateId as keyof typeof templateRegistry];
}

/**
 * Create workflow from template
 */
export async function createWorkflowFromTemplate(
  templateId: string,
  params: Record<string, unknown> = {}
) {
  const template = templateRegistry[templateId as keyof typeof templateRegistry];
  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }
  return template.create(params);
}


















