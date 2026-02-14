/**
 * Document Tags API Routes
 * 
 * Provides CRUD operations for document tags.
 */
import express, { Router, Request, Response } from 'express';
import { validate } from '../middleware/validation.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { DocumentTag, type DocumentTagCreateInput } from '../models/DocumentTag.js';
import { getCanonicalDocumentService } from '../services/canonical/CanonicalDocumentService.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../types/errors.js';
import { z } from 'zod';

const router: Router = express.Router();

// Validation schemas
const createTagSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/i, 'Tag ID must contain only alphanumeric characters, hyphens, and underscores'),
  label: z.string().min(1).max(200),
  category: z.enum(['theme', 'documentType', 'jurisdiction', 'custom']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).optional(),
});

const updateTagSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/document-tags
 * List all tags, optionally filtered by category or userId
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const category = req.query.category;
  const userId = req.query.userId;

  if (category && typeof category !== 'string') {
    throw new BadRequestError('Invalid category parameter');
  }

  if (userId && typeof userId !== 'string') {
    throw new BadRequestError('Invalid userId parameter');
  }

  const tags = await DocumentTag.findMany({
    category: category as 'theme' | 'documentType' | 'jurisdiction' | 'custom' | undefined,
    userId: userId as string | undefined
  });
  res.json(tags);
}));

/**
 * GET /api/document-tags/:id
 * Get a specific tag by ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tagId = req.params.id;
  const tag = await DocumentTag.findById(tagId);

  if (!tag) {
    throw new NotFoundError(`Tag with id ${tagId} not found`);
  }

  res.json(tag);
}));

/**
 * POST /api/document-tags
 * Create a new tag
 */
router.post('/', sanitizeInput, validate({ body: createTagSchema }), asyncHandler(async (req: Request, res: Response) => {
  const tagData: DocumentTagCreateInput = {
    id: req.body.id,
    label: req.body.label,
    category: req.body.category || 'custom',
    color: req.body.color,
    description: req.body.description,
    userId: (req as any).user?.id || (req as any).auth?.userId, // Get userId from auth middleware
  };

  // Check if tag already exists
  const existingTag = await DocumentTag.findById(tagData.id);
  if (existingTag) {
    throw new BadRequestError(`Tag with id ${tagData.id} already exists`);
  }

  const tag = await DocumentTag.create(tagData);
  logger.info({ tagId: tag.id }, 'Created document tag');
  res.status(201).json(tag);
}));

/**
 * PUT /api/document-tags/:id
 * Update a tag
 */
router.put('/:id', sanitizeInput, validate({ body: updateTagSchema }), asyncHandler(async (req: Request, res: Response) => {
  const tagId = req.params.id;
  const updates: Partial<Pick<DocumentTagCreateInput, 'label' | 'color' | 'description'>> = {};

  if (req.body.label !== undefined) updates.label = req.body.label;
  if (req.body.color !== undefined) updates.color = req.body.color;
  if (req.body.description !== undefined) updates.description = req.body.description;

  const tag = await DocumentTag.update(tagId, updates);
  if (!tag) {
    throw new NotFoundError(`Tag with id ${tagId} not found`);
  }

  logger.info({ tagId }, 'Updated document tag');
  res.json(tag);
}));

/**
 * DELETE /api/document-tags/:id
 * Delete a tag
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const tagId = req.params.id;
  const deleted = await DocumentTag.delete(tagId);

  if (!deleted) {
    throw new NotFoundError(`Tag with id ${tagId} not found`);
  }

  logger.info({ tagId }, 'Deleted document tag');
  res.status(204).send();
}));

/**
 * POST /api/document-tags/:tagId/documents/:documentId
 * Add a tag to a document
 */
router.post('/:tagId/documents/:documentId', asyncHandler(async (req: Request, res: Response) => {
  const { tagId, documentId } = req.params;

  // Verify tag exists
  const tag = await DocumentTag.findById(tagId);
  if (!tag) {
    throw new NotFoundError(`Tag with id ${tagId} not found`);
  }

  // Get document service
  const documentService = getCanonicalDocumentService();
  const document = await documentService.findById(documentId);
  if (!document) {
    throw new NotFoundError(`Document with id ${documentId} not found`);
  }

  // Add tag to document if not already present
  const currentTags = document.tags || [];
  if (!currentTags.includes(tagId)) {
    // Use upsertBySourceId to update the document
    const updatedDraft = {
      ...document,
      tags: [...currentTags, tagId],
    };
    // Remove system fields that shouldn't be in draft
    const { _id, createdAt, updatedAt, schemaVersion, ...draftFields } = updatedDraft;
    await documentService.upsertBySourceId(draftFields as any, {});

    // Increment tag usage count
    await DocumentTag.incrementUsageCount(tagId);
  }

  res.json({ success: true, message: 'Tag added to document' });
}));

/**
 * DELETE /api/document-tags/:tagId/documents/:documentId
 * Remove a tag from a document
 */
router.delete('/:tagId/documents/:documentId', asyncHandler(async (req: Request, res: Response) => {
  const { tagId, documentId } = req.params;

  // Get document service
  const documentService = getCanonicalDocumentService();
  const document = await documentService.findById(documentId);
  if (!document) {
    throw new NotFoundError(`Document with id ${documentId} not found`);
  }

  // Remove tag from document if present
  const currentTags = document.tags || [];
  if (currentTags.includes(tagId)) {
    // Use upsertBySourceId to update the document
    const updatedDraft = {
      ...document,
      tags: currentTags.filter(id => id !== tagId),
    };
    // Remove system fields that shouldn't be in draft
    const { _id, createdAt, updatedAt, schemaVersion, ...draftFields } = updatedDraft;
    await documentService.upsertBySourceId(draftFields as any, {});

    // Decrement tag usage count
    await DocumentTag.decrementUsageCount(tagId);
  }

  res.json({ success: true, message: 'Tag removed from document' });
}));

export default router;
