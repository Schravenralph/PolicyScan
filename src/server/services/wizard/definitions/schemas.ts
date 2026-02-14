/**
 * Wizard Step Schemas - Single Source of Truth
 * 
 * This file contains all validation schemas for wizard steps.
 * These schemas are the single source of truth and must be imported by:
 * - Wizard step definitions (beleidsscanWizardDefinition.ts)
 * - Action implementations (steps/[stepName]/Action.ts)
 * - API routes (routes/*.ts) - when implemented
 * 
 * This ensures consistency across all layers and prevents duplication.
 */

import { z } from 'zod';

/**
 * Step 1: Query Configuration Schemas
 */

/**
 * Input schema for query-configuration step (createQuery action)
 */
export const queryConfigurationInputSchema = z.object({
  overheidslaag: z.string().min(1, 'overheidslaag is required'),
  entity: z.string().optional(),
  onderwerp: z.string().min(1, 'onderwerp is required').transform((val) => val.trim()),
}).refine(
  (data) => {
    // entity is required unless overheidslaag === 'kennisinstituut'
    if (data.overheidslaag !== 'kennisinstituut' && !data.entity) {
      return false;
    }
    return true;
  },
  {
    message: 'entity is required unless overheidslaag is "kennisinstituut"',
    path: ['entity'],
  }
).refine(
  (data) => {
    // onderwerp must be at least 3 characters after trim
    const trimmed = data.onderwerp.trim();
    return trimmed.length >= 3;
  },
  {
    message: 'onderwerp must be at least 3 characters after trimming',
    path: ['onderwerp'],
  }
);

/**
 * Output schema for query-configuration step (createQuery action)
 * 
 * Note: Uses .passthrough() to allow additional fields from MongoDB documents
 * and flexible date handling to support both Date objects and ISO strings.
 */
export const queryConfigurationOutputSchema = z.object({
  queryId: z.string().min(1),
  query: z.object({
    _id: z.unknown().optional(),
    overheidstype: z.string().optional(),
    overheidsinstantie: z.string().optional(),
    onderwerp: z.string(),
    websiteTypes: z.array(z.string()),
    websiteUrls: z.array(z.string()).optional(),
    documentUrls: z.array(z.string()).optional(),
    createdAt: z.union([z.date(), z.string()]).optional(),
    updatedAt: z.union([z.date(), z.string()]).optional(),
  }).passthrough(), // Allow additional MongoDB document fields
  contextUpdates: z.object({
    queryId: z.string(),
  }),
});

/**
 * Step 2: Website Selection Schemas
 */

/**
 * Input schema for website-selection step (generateSuggestions action)
 */
export const generateWebsiteSuggestionsInputSchema = z.object({
  queryId: z.string().min(1, 'queryId is required'),
});

/**
 * Output schema for website-selection step (generateSuggestions action)
 */
export const generateWebsiteSuggestionsOutputSchema = z.object({
  suggestedWebsites: z.array(z.object({
    id: z.string(),
    url: z.string(),
    label: z.string().optional(),
    confidence: z.number().optional(),
    source: z.string().optional(),
  })),
  generatedAt: z.string(),
  contextUpdates: z.object({
    suggestedWebsites: z.array(z.unknown()).optional(),
    websiteSuggestionsGeneratedAt: z.string().optional(),
  }).optional(),
});

/**
 * Input schema for website-selection step (confirmSelection action)
 */
export const confirmWebsiteSelectionInputSchema = z.object({
  queryId: z.string().min(1, 'queryId is required'),
  selectedWebsiteIds: z.array(z.string().min(1)).min(0, 'selectedWebsiteIds must be an array (can be empty to skip website scraping)'),
});

/**
 * Output schema for website-selection step (confirmSelection action)
 */
export const confirmWebsiteSelectionOutputSchema = z.object({
  selectedWebsiteIds: z.array(z.string()),
  websiteCount: z.number(),
  contextUpdates: z.object({
    selectedWebsiteIds: z.array(z.string()),
  }),
});

/**
 * Combined input schema for website-selection step (union of both actions)
 */
export const websiteSelectionInputSchema = z.union([
  generateWebsiteSuggestionsInputSchema,
  confirmWebsiteSelectionInputSchema,
]);

/**
 * Combined output schema for website-selection step (union of both actions)
 */
export const websiteSelectionOutputSchema = z.union([
  generateWebsiteSuggestionsOutputSchema,
  confirmWebsiteSelectionOutputSchema,
]);

/**
 * Step 3: Document Review Schemas
 */

/**
 * Input schema for document-review step (startScan action)
 */
export const startScanInputSchema = z.object({
  queryId: z.string().min(1, 'queryId is required'),
  forceNewRun: z.boolean().optional().default(false),
});

/**
 * Output schema for document-review step (startScan action)
 */
export const startScanOutputSchema = z.object({
  runId: z.string(),
  status: z.string(),
  isExistingRun: z.boolean().optional().default(false),
  contextUpdates: z.object({
    runId: z.string(),
  }),
});

/**
 * Input schema for document-review step (getScanStatus action)
 * Note: Empty object schema is intentional - this action requires no input parameters
 */
export const getScanStatusInputSchema = z.object({});

/**
 * Output schema for document-review step (getScanStatus action)
 */
export const getScanStatusOutputSchema = z.object({
  status: z.string(),
  runId: z.string().optional(),
  progress: z.object({
    progress: z.number().optional(),
    status: z.string().optional(),
    currentStep: z.string().optional(),
    documentsFound: z.number().optional(),
    estimatedTime: z.number().nullable().optional(),
  }).optional(),
  error: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

/**
 * Input schema for document-review step (getResults action)
 */
export const getResultsInputSchema = z.object({
  skipPersistence: z.boolean().optional().default(false),
});

/**
 * Output schema for document-review step (getResults action)
 */
export const getResultsOutputSchema = z.object({
  documents: z.array(z.object({
    url: z.string(),
    title: z.string(),
    titel: z.string().optional(),
    samenvatting: z.string().optional(),
    source: z.string().optional(),
    sourceUrl: z.string().optional(),
    website_url: z.string().optional(),
    website_titel: z.string().optional(),
    score: z.number().optional(),
    relevanceScore: z.number().optional(),
    authorityScore: z.number().optional(),
    category: z.string().optional(),
    type: z.string().optional(),
    type_document: z.string().optional(),
    publicatiedatum: z.string().nullable().optional(),
    discoveredAt: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })),
  totalCount: z.number(),
  runId: z.string(),
  runStatus: z.string(),
  contextUpdates: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Input schema for document-review step (applyReviewDecisions action)
 */
export const applyReviewDecisionsInputSchema = z.object({
  decisions: z.record(z.string(), z.enum(['approved', 'rejected'])).refine(
    (decisions) => Object.keys(decisions).length > 0,
    {
      message: 'At least one decision must be provided',
    }
  ),
});

/**
 * Output schema for document-review step (applyReviewDecisions action)
 */
export const applyReviewDecisionsOutputSchema = z.object({
  appliedCount: z.number(),
  approvedCount: z.number(),
  rejectedCount: z.number(),
  contextUpdates: z.object({
    reviewDecisions: z.record(z.string(), z.enum(['approved', 'rejected'])),
  }),
});

/**
 * Combined input schema for document-review step (union of all actions)
 */
export const documentReviewInputSchema = z.union([
  startScanInputSchema,
  getScanStatusInputSchema,
  getResultsInputSchema,
  applyReviewDecisionsInputSchema,
]);

/**
 * Combined output schema for document-review step (union of all actions)
 */
export const documentReviewOutputSchema = z.union([
  startScanOutputSchema,
  getScanStatusOutputSchema,
  getResultsOutputSchema,
  applyReviewDecisionsOutputSchema,
]);

