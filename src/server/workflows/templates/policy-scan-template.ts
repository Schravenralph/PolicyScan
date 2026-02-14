/**
 * Policy Scan Workflow Template
 * 
 * A template for scanning policy documents from various sources.
 * This template can be instantiated with different parameters for different use cases.
 */

import { Workflow } from '../../services/infrastructure/types.js';

export interface PolicyScanTemplateParams {
  query?: string;
  onderwerp?: string;
  thema?: string;
  maxDepth?: number;
  includeGoogle?: boolean;
  includeIPLO?: boolean;
  includeKnownSources?: boolean;
}

/**
 * Create a policy scan workflow from template
 */
export function createPolicyScanWorkflow(
  params: PolicyScanTemplateParams = {}
): Workflow {
  const {
    query = '',
    onderwerp = '',
    thema = '',
    maxDepth = 3,
    includeGoogle = true,
    includeIPLO = true,
    includeKnownSources = true
  } = params;

  const steps: Workflow['steps'] = [];

  // Step 1: Enhance query with IMBOR
  steps.push({
    id: 'enhance-query',
    name: 'Enhance Query with IMBOR',
    action: 'enhance_with_imbor',
    params: {
      onderwerp: onderwerp || query,
      thema: thema
    },
    next: 'scan-sources'
  });

  // Step 2: Scan sources based on configuration
  if (includeIPLO) {
    steps.push({
      id: 'scan-iplo',
      name: 'Scan IPLO',
      action: 'scan_iplo',
      params: {
        query: query || onderwerp,
        theme: thema,
        maxDepth
      },
      next: includeKnownSources ? 'scan-known-sources' : includeGoogle ? 'scan-google' : 'score-documents'
    });
  }

  if (includeKnownSources) {
    steps.push({
      id: 'scan-known-sources',
      name: 'Scan Known Sources',
      action: 'scan_known_sources',
      params: {
        query: query || onderwerp,
        thema: thema
      },
      next: includeGoogle ? 'scan-google' : 'score-documents'
    });
  }

  if (includeGoogle) {
    steps.push({
      id: 'scan-google',
      name: 'Cross-reference with Google',
      action: 'scan_google',
      params: {
        query: query || onderwerp,
        thema: thema
      },
      next: 'score-documents'
    });
  }

  // Step 3: Score and filter documents
  steps.push({
    id: 'score-documents',
    name: 'Score and Filter Documents',
    action: 'score_documents'
  });

  // Set next pointers
  for (let i = 0; i < steps.length - 1; i++) {
    if (!steps[i].next) {
      steps[i].next = steps[i + 1].id;
    }
  }

  return {
    id: `policy-scan-${Date.now()}`,
    name: 'Policy Scan Workflow',
    description: `Policy document scanning workflow for: ${onderwerp || query || 'general policy scan'}`,
    steps
  };
}

/**
 * Default policy scan workflow instance
 */
export const defaultPolicyScanWorkflow = createPolicyScanWorkflow();














