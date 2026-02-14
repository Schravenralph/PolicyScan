/**
 * Document Summarization API Routes
 * 
 * Provides endpoints for generating and retrieving document summaries.
 */

import express, { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDocumentSummarizationService } from '../services/summarization/DocumentSummarizationService.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

const router: Router = express.Router();

/**
 * GET /api/summarization/:documentId
 * Get existing summary for a document
 */
router.get('/:documentId', asyncHandler(async (req: Request, res: Response) => {
  const { documentId } = req.params;

  // Validate document ID
  if (!ObjectId.isValid(documentId)) {
    throw new BadRequestError('Invalid document ID format', {
      documentId,
      operation: 'getSummary'
    });
  }

  const summarizationService = getDocumentSummarizationService();
  const summary = await summarizationService.getSummary(documentId);

  if (summary === null) {
    res.status(404).json({
      error: 'Summary not found',
      documentId,
      message: 'No summary exists for this document. Use POST to generate one.'
    });
    return;
  }

  res.json({
    summary,
    documentId,
    hasSummary: true
  });
}));

/**
 * POST /api/summarization/:documentId
 * Generate summary for a document (or return existing if present)
 */
router.post('/:documentId', asyncHandler(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const { forceRegenerate } = req.body as { forceRegenerate?: boolean };

  // Validate document ID
  if (!ObjectId.isValid(documentId)) {
    throw new BadRequestError('Invalid document ID format', {
      documentId,
      operation: 'summarizeDocument'
    });
  }

  logger.info({ documentId, forceRegenerate }, 'Generating document summary via API');

  const summarizationService = getDocumentSummarizationService();
  const summary = await summarizationService.summarizeDocument(
    documentId,
    forceRegenerate === true
  );

  res.json({
    summary,
    documentId,
    generated: true,
    regenerated: forceRegenerate === true
  });
}));

/**
 * POST /api/summarization/:documentId/regenerate
 * Force regeneration of summary for a document
 */
router.post('/:documentId/regenerate', asyncHandler(async (req: Request, res: Response) => {
  const { documentId } = req.params;

  // Validate document ID
  if (!ObjectId.isValid(documentId)) {
    throw new BadRequestError('Invalid document ID format', {
      documentId,
      operation: 'regenerateSummary'
    });
  }

  logger.info({ documentId }, 'Regenerating document summary via API');

  const summarizationService = getDocumentSummarizationService();
  const summary = await summarizationService.regenerateSummary(documentId);

  res.json({
    summary,
    documentId,
    generated: true,
    regenerated: true
  });
}));

export default router;
