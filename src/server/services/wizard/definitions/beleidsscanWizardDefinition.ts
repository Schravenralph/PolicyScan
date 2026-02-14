/**
 * Beleidsscan Wizard Definition (Version 1)
 * 
 * This file defines the complete wizard structure for the Beleidsscan wizard,
 * including all three steps with their schemas, prerequisites, navigation rules,
 * and completion criteria.
 * 
 * This is the single source of truth for the wizard structure and should be
 * used by WizardSessionEngine for session creation and navigation validation.
 */

import type { WizardStepDefinition } from '../WizardStepDefinition.js';
import type { WizardSessionDocument } from '../../../types/WizardSession.js';
import { BadRequestError } from '../../../types/errors.js';

// Import schemas from single source of truth
import {
  queryConfigurationInputSchema,
  queryConfigurationOutputSchema,
  websiteSelectionInputSchema,
  websiteSelectionOutputSchema,
  documentReviewInputSchema,
  documentReviewOutputSchema,
} from './schemas.js';

/**
 * Wizard Definition Structure
 */
export interface WizardDefinition {
  id: string;
  version: number;
  steps: WizardStepDefinition[];
}

/**
 * Step 1: Query Configuration
 * 
 * Allows users to configure the query parameters (overheidslaag, entity, onderwerp).
 * This is the first step with no prerequisites.
 */
const queryConfigurationStep: WizardStepDefinition = {
  id: 'query-configuration',
  name: 'Query Configuration',
  description: 'Configure your search query with government layer, entity, and topic',

  // Input schema: from single source of truth
  inputSchema: queryConfigurationInputSchema,

  // Output schema: from single source of truth
  outputSchema: queryConfigurationOutputSchema,

  // No prerequisites - this is the first step
  prerequisites: [],

  // Navigation rules
  navigation: {
    next: 'website-selection',
    prev: undefined,
    canGoBack: false,
    canJumpTo: true, // Can start directly at this step
  },

  // Completion criteria: queryId must be set in context
  completionCriteria: (session: WizardSessionDocument) => {
    return Boolean(session.context.queryId);
  },
};

/**
 * Step 2: Website Selection (Optional)
 * 
 * Allows users to generate website suggestions and select websites for scanning.
 * Requires query-configuration to be completed.
 * 
 * This step is OPTIONAL - users can skip directly to document-review.
 * The 8-step beleidsscan workflow will run all steps regardless of website selection.
 */
const websiteSelectionStep: WizardStepDefinition = {
  id: 'website-selection',
  name: 'Website Selection',
  description: 'Generate and select websites to scan for documents (optional)',

  // Input schema: union of both actions (from single source of truth)
  // In practice, the engine will route to the specific action based on actionId
  inputSchema: websiteSelectionInputSchema,

  // Output schema: union of both action outputs (from single source of truth)
  outputSchema: websiteSelectionOutputSchema,

  // Prerequisites: query-configuration must be completed
  prerequisites: ['query-configuration'],

  // Navigation rules
  navigation: {
    next: 'document-review',
    prev: 'query-configuration',
    canGoBack: true,
    canJumpTo: true, // Can jump to this step (after query-configuration)
  },

  // Completion criteria: OPTIONAL step - always considered complete if user proceeds
  // (selectedWebsiteIds can be empty array)
  completionCriteria: (_session: WizardSessionDocument) => {
    // This step is optional - always allow proceeding to next step
    // The 8-step workflow will run regardless of website selection
    return true;
  },
};

/**
 * Step 3: Document Review
 * 
 * Allows users to start a scan, view results, and apply review decisions.
 * Only requires query-configuration (website-selection is optional).
 * 
 * The startScan action triggers the 8-step beleidsscan-wizard workflow:
 * 1. Search DSO Omgevingsdocumenten (Discovery)
 * 2. Enrich DSO Documents (Optional)
 * 3. Search IPLO Documents
 * 4. Scan Selected Websites (skipped if no websites selected)
 * 5. Merge + Score + Categorize
 * 6. Search Official Publications
 * 7. Search Jurisprudence
 * 8. Optional Deep Discovery (Common Crawl)
 */
const documentReviewStep: WizardStepDefinition = {
  id: 'document-review',
  name: 'Document Review',
  description: 'Review discovered documents and apply approval/rejection decisions',

  // Input schema: union of all document-review actions (from single source of truth)
  // In practice, the engine will route to the specific action based on actionId
  inputSchema: documentReviewInputSchema,

  // Output schema: union of all action outputs (from single source of truth)
  outputSchema: documentReviewOutputSchema,

  // Prerequisites: only query-configuration is required (website-selection is optional)
  prerequisites: ['query-configuration'],

  // Navigation rules
  navigation: {
    next: undefined, // This is the last step
    prev: 'website-selection',
    canGoBack: true,
    canJumpTo: false, // Cannot skip prerequisites
  },

  // Completion criteria:
  // - Scan results available (documents in context)
  // - Decisions applied and complete (reviewDecisions in context)
  // - At least one approved document
  completionCriteria: (session: WizardSessionDocument) => {
    // Check if scan results are available
    const documents =
      (session.context.documents && Array.isArray(session.context.documents) && session.context.documents.length > 0) ||
      (session.context.scanResults &&
        typeof session.context.scanResults === 'object' &&
        'documents' in session.context.scanResults &&
        Array.isArray(session.context.scanResults.documents) &&
        session.context.scanResults.documents.length > 0) ||
      (session.context.results &&
        typeof session.context.results === 'object' &&
        'documents' in session.context.results &&
        Array.isArray(session.context.results.documents) &&
        session.context.results.documents.length > 0);

    if (!documents) {
      return false;
    }

    // Check if decisions are applied
    const reviewDecisions = session.context.reviewDecisions;
    if (!reviewDecisions || typeof reviewDecisions !== 'object') {
      return false;
    }

    // Check that at least one document is approved
    const decisions = reviewDecisions as Record<string, 'approved' | 'rejected'>;
    const approvedCount = Object.values(decisions).filter(
      (decision) => decision === 'approved'
    ).length;

    return approvedCount > 0;
  },
};

/**
 * Beleidsscan Wizard Definition (Version 1)
 * 
 * This is the versioned wizard definition that can be loaded for session creation
 * and resume. The version number allows for future schema migrations.
 */
export const beleidsscanWizardDefinitionV1: WizardDefinition = {
  id: 'beleidsscan-wizard',
  version: 1,
  steps: [
    queryConfigurationStep,
    websiteSelectionStep,
    documentReviewStep,
  ],
};

/**
 * Get wizard definition by version
 * 
 * @param version - The version number (default: 1)
 * @returns The wizard definition for the specified version
 */
export function getBeleidsscanWizardDefinition(version: number = 1): WizardDefinition {
  switch (version) {
    case 1:
      return beleidsscanWizardDefinitionV1;
    default:
      throw new BadRequestError(`Unsupported wizard definition version: ${version}`, {
        version,
        supportedVersions: ['1.0.0'],
        reason: 'unsupported_version'
      });
  }
}

