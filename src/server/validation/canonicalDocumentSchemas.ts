/**
 * Canonical Document API Validation Schemas
 * 
 * Zod schemas for validating canonical document API requests.
 * Used by the /api/canonical-documents routes.
 * 
 * @see WI-411: API Layer Migration
 */

import { z } from 'zod';
import { commonSchemas } from '../middleware/validation.js';
import { documentSourceSchema, documentFamilySchema, documentFormatSchema, documentReviewStatusSchema, documentReviewMetadataSchema } from './canonicalSchemas.js';

/**
 * Validation schemas for canonical document API endpoints
 */
export const canonicalDocumentSchemas = {
  /**
   * GET /api/canonical-documents/:id
   * Get document by ID
   */
  getById: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
  },

  /**
   * GET /api/canonical-documents/query/:queryId
   * Get documents by query ID
   */
  getByQuery: {
    params: z.object({
      queryId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Query ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      limit: z.coerce.number().int().positive().max(20000).optional(),
      skip: z.coerce.number().optional(),
      page: z.coerce.number().optional(),
    }),
  },

  /**
   * GET /api/canonical-documents/workflow-run/:runId
   * Get documents by workflow run ID
   */
  getByWorkflowRun: {
    params: z.object({
      runId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Workflow run ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      limit: z.coerce.number().optional(),
      skip: z.coerce.number().optional(),
      page: z.coerce.number().optional(),
    }).optional(),
  },

  /**
   * GET /api/canonical-documents/website
   * Get documents by website URL
   */
  getByWebsite: {
    query: z.object({
      url: commonSchemas.url,
      limit: z.coerce.number().optional(),
      skip: z.coerce.number().optional(),
      page: z.coerce.number().optional(),
    }),
  },

  /**
   * POST /api/canonical-documents
   * Create a new canonical document
   */
  create: {
    body: z.object({
      source: documentSourceSchema,
      sourceId: z.string().min(1, 'sourceId is required'),
      canonicalUrl: z.string().url().optional(),
      title: z.string().min(1, 'title is required'),
      publisherAuthority: z.string().optional(),
      documentFamily: documentFamilySchema,
      documentType: z.string().min(1, 'documentType is required'),
      dates: z.object({
        publishedAt: z.string().datetime().optional().or(z.date().optional()),
        validFrom: z.string().datetime().optional().or(z.date().optional()),
        validTo: z.string().datetime().optional().or(z.date().optional()),
      }).optional(),
      fullText: z.string().min(1, 'fullText is required and must not be empty'),
      contentFingerprint: z
        .string()
        .regex(/^[a-f0-9]{64}$/i, 'contentFingerprint must be a 64-character hex string (sha256)'),
      language: z.string().min(2).max(5).default('nl'),
      artifactRefs: z.array(z.any()).default([]),
      sourceMetadata: z.record(z.string(), z.any()),
      enrichmentMetadata: z.record(z.string(), z.any()).optional(),
      documentStructure: z.enum(['singleton', 'bundle']).optional(),
      format: documentFormatSchema.optional(),
      formatComposition: z.any().optional(),
      versionOf: z.string().optional(),
      // Review status - defaults to 'pending_review' if not provided
      reviewStatus: documentReviewStatusSchema.optional(),
    }),
  },

  /**
   * PATCH /api/canonical-documents/:id
   * Update a canonical document
   */
  update: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    body: z.object({
      canonicalUrl: z.string().url().optional(),
      title: z.string().min(1).optional(),
      publisherAuthority: z.string().optional(),
      documentFamily: documentFamilySchema.optional(),
      documentType: z.string().min(1).optional(),
      dates: z.object({
        publishedAt: z.string().datetime().optional().or(z.date().optional()),
        validFrom: z.string().datetime().optional().or(z.date().optional()),
        validTo: z.string().datetime().optional().or(z.date().optional()),
      }).optional(),
      fullText: z.string().min(1).optional(),
      contentFingerprint: z
        .string()
        .regex(/^[a-f0-9]{64}$/i, 'contentFingerprint must be a 64-character hex string (sha256)')
        .optional(),
      language: z.string().min(2).max(5).optional(),
      artifactRefs: z.array(z.any()).optional(),
      sourceMetadata: z.record(z.string(), z.any()).optional(),
      enrichmentMetadata: z.record(z.string(), z.any()).optional(),
      documentStructure: z.enum(['singleton', 'bundle']).optional(),
      format: documentFormatSchema.optional(),
      formatComposition: z.any().optional(),
      versionOf: z.string().optional(),
      reviewStatus: documentReviewStatusSchema.optional(),
      tags: z.array(z.string()).optional(),
      collectionIds: z.array(z.string()).optional(),
    }).refine(
      (data) => Object.keys(data).length > 0,
      { message: 'At least one field must be provided for update' }
    ),
  },

  /**
   * PATCH /api/canonical-documents/:id/acceptance
   * Update document acceptance status
   * @deprecated Use updateReviewStatus instead
   */
  updateAcceptance: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    body: z.object({
      accepted: z.boolean().nullable(),
    }),
  },

  /**
   * PATCH /api/canonical-documents/:id/review-status
   * Update document review status
   */
  updateReviewStatus: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    body: z.object({
      reviewStatus: documentReviewStatusSchema,
      reviewNotes: z.string().optional(),
    }),
  },

  /**
   * POST /api/canonical-documents/bulk-review-status
   * Bulk update review status for multiple documents
   */
  bulkUpdateReviewStatus: {
    body: z.object({
      documentIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId')).min(1, 'At least one document ID is required'),
      reviewStatus: documentReviewStatusSchema,
      reviewNotes: z.string().optional(),
    }),
  },

  /**
   * GET /api/canonical-documents/review-queue
   * Get documents pending review
   */
  getReviewQueue: {
    query: z.object({
      reviewStatus: z.union([
        documentReviewStatusSchema,
        z.array(documentReviewStatusSchema),
      ]).optional(),
      source: documentSourceSchema.optional(),
      documentFamily: documentFamilySchema.optional(),
      limit: z.coerce.number().optional(),
      skip: z.coerce.number().optional(),
      page: z.coerce.number().optional(),
    }).optional(),
  },

  /**
   * DELETE /api/canonical-documents/:id
   * Delete a canonical document
   */
  delete: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
  },

  /**
   * GET /api/canonical-documents/:id/with-extensions
   * Get document with extensions loaded
   */
  getWithExtensions: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      extensionTypes: z.string().optional(), // Comma-separated list
    }).optional(),
  },

  /**
   * POST /api/canonical-documents/with-extensions
   * Batch load documents with extensions
   */
  batchWithExtensions: {
    body: z.object({
      documentIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId')).min(1, 'At least one document ID is required'),
      extensionTypes: z.array(z.enum(['geo', 'legal', 'web'])).optional(),
    }),
  },

  /**
   * GET /api/canonical-documents/:id/artifacts
   * Get all artifact references
   */
  getArtifacts: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
  },

  /**
   * GET /api/canonical-documents/:id/artifacts/:mimeType
   * Get artifact reference by MIME type
   */
  getArtifactByMimeType: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
      mimeType: z.string().min(1, 'MIME type is required'),
    }),
  },

  /**
   * GET /api/canonical-documents/:id/artifact-content
   * Get artifact content as binary
   */
  getArtifactContent: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      mimeType: z.string().optional(),
    }).optional(),
  },

  /**
   * GET /api/canonical-documents/:id/artifact-content/text
   * Get artifact content as text
   */
  getArtifactContentText: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      mimeType: z.string().optional(),
      encoding: z.string().optional(),
    }).optional(),
  },

  /**
   * GET /api/canonical-documents/:id/bundle/files
   * List all files in bundle
   */
  listBundleFiles: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      bundleMimeType: z.string().optional(),
    }).optional(),
  },

  /**
   * GET /api/canonical-documents/:id/bundle/files/:format
   * Get files in bundle by format
   */
  getBundleFilesByFormat: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
      format: z.string().min(1, 'Format is required'),
    }),
    query: z.object({
      bundleMimeType: z.string().optional(),
    }).optional(),
  },

  /**
   * GET /api/canonical-documents/:id/bundle/file-content
   * Extract file from bundle as binary
   */
  getBundleFileContent: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      filename: z.string().min(1, 'filename is required'),
      bundleMimeType: z.string().optional(),
    }),
  },

  /**
   * GET /api/canonical-documents/:id/bundle/file-content/text
   * Extract file from bundle as text
   */
  getBundleFileContentText: {
    params: z.object({
      id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID must be a valid MongoDB ObjectId'),
    }),
    query: z.object({
      filename: z.string().min(1, 'filename is required'),
      bundleMimeType: z.string().optional(),
      encoding: z.string().optional(),
    }),
  },
};

