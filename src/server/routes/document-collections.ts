/**
 * Document Collections API Routes
 * 
 * Provides CRUD operations for document collections.
 */
import express, { Router, Request, Response } from 'express';
import { validate } from '../middleware/validation.js';
import { sanitizeInput } from '../middleware/sanitize.js';
import { DocumentCollection, type DocumentCollectionCreateInput } from '../models/DocumentCollection.js';
import { getCanonicalDocumentService } from '../services/canonical/CanonicalDocumentService.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../types/errors.js';
import { z } from 'zod';
import { ObjectId } from 'mongodb';

const router: Router = express.Router();

// Validation schemas
const createCollectionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
});

/**
 * GET /api/document-collections
 * List all collections, optionally filtered by userId
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const collections = await DocumentCollection.findMany({ userId });
  res.json(collections);
}));

/**
 * GET /api/document-collections/:id
 * Get a specific collection by ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const collectionId = req.params.id;
  const collection = await DocumentCollection.findById(collectionId);

  if (!collection) {
    throw new NotFoundError(`Collection with id ${collectionId} not found`);
  }

  res.json(collection);
}));

/**
 * POST /api/document-collections
 * Create a new collection
 */
router.post('/', sanitizeInput, validate({ body: createCollectionSchema }), asyncHandler(async (req: Request, res: Response) => {
  const collectionData: DocumentCollectionCreateInput = {
    name: req.body.name,
    description: req.body.description,
    color: req.body.color,
    icon: req.body.icon,
    userId: (req as any).user?.id || (req as any).auth?.userId,
  };

  const collection = await DocumentCollection.create(collectionData);
  logger.info({ collectionId: collection._id?.toString() }, 'Created document collection');
  res.status(201).json(collection);
}));

/**
 * PUT /api/document-collections/:id
 * Update a collection
 */
router.put('/:id', sanitizeInput, validate({ body: updateCollectionSchema }), asyncHandler(async (req: Request, res: Response) => {
  const collectionId = req.params.id;
  const updates: Partial<Pick<DocumentCollectionCreateInput, 'name' | 'description' | 'color' | 'icon'>> = {};

  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.color !== undefined) updates.color = req.body.color;
  if (req.body.icon !== undefined) updates.icon = req.body.icon;

  const collection = await DocumentCollection.update(collectionId, updates);
  if (!collection) {
    throw new NotFoundError(`Collection with id ${collectionId} not found`);
  }

  logger.info({ collectionId }, 'Updated document collection');
  res.json(collection);
}));

/**
 * DELETE /api/document-collections/:id
 * Delete a collection
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const collectionId = req.params.id;
  const deleted = await DocumentCollection.delete(collectionId);

  if (!deleted) {
    throw new NotFoundError(`Collection with id ${collectionId} not found`);
  }

  logger.info({ collectionId }, 'Deleted document collection');
  res.status(204).send();
}));

/**
 * POST /api/document-collections/:collectionId/documents/:documentId
 * Add a document to a collection
 */
router.post('/:collectionId/documents/:documentId', asyncHandler(async (req: Request, res: Response) => {
  const { collectionId, documentId } = req.params;

  // Verify collection exists
  const collection = await DocumentCollection.findById(collectionId);
  if (!collection) {
    throw new NotFoundError(`Collection with id ${collectionId} not found`);
  }

  // Verify document exists
  const documentService = getCanonicalDocumentService();
  const document = await documentService.findById(documentId);
  if (!document) {
    throw new NotFoundError(`Document with id ${documentId} not found`);
  }

  // Add document to collection
  const updatedCollection = await DocumentCollection.addDocument(collectionId, documentId);
  if (!updatedCollection) {
    throw new BadRequestError('Failed to add document to collection');
  }

  // Update document's collectionIds
  const currentCollectionIds = (document as any).collectionIds || [];
  if (!currentCollectionIds.includes(collectionId)) {
    const updatedDraft = {
      ...document,
      collectionIds: [...currentCollectionIds, collectionId],
    };
    const { _id, createdAt, updatedAt, schemaVersion, ...draftFields } = updatedDraft;
    await documentService.upsertBySourceId(draftFields as any, {});
  }

  res.json({ success: true, message: 'Document added to collection' });
}));

/**
 * DELETE /api/document-collections/:collectionId/documents/:documentId
 * Remove a document from a collection
 */
router.delete('/:collectionId/documents/:documentId', asyncHandler(async (req: Request, res: Response) => {
  const { collectionId, documentId } = req.params;

  // Verify document exists
  const documentService = getCanonicalDocumentService();
  const document = await documentService.findById(documentId);
  if (!document) {
    throw new NotFoundError(`Document with id ${documentId} not found`);
  }

  // Remove document from collection
  const updatedCollection = await DocumentCollection.removeDocument(collectionId, documentId);
  if (!updatedCollection) {
    throw new NotFoundError(`Collection with id ${collectionId} not found`);
  }

  // Update document's collectionIds
  const currentCollectionIds = (document as any).collectionIds || [];
  if (currentCollectionIds.includes(collectionId)) {
    const updatedDraft = {
      ...document,
      collectionIds: currentCollectionIds.filter((id: string) => id !== collectionId),
    };
    const { _id, createdAt, updatedAt, schemaVersion, ...draftFields } = updatedDraft;
    await documentService.upsertBySourceId(draftFields as any, {});
  }

  res.json({ success: true, message: 'Document removed from collection' });
}));

/**
 * GET /api/document-collections/documents/:documentId
 * Get all collections containing a specific document
 */
router.get('/documents/:documentId', asyncHandler(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const collections = await DocumentCollection.findByDocumentId(documentId);
  res.json(collections);
}));

export default router;
