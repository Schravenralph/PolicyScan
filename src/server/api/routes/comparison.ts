/**
 * Document Comparison API Routes
 * 
 * API endpoints for structured document-to-document comparison.
 * 
 * @see docs/21-issues/WI-COMPARISON-001-structured-document-comparison.md
 */

import { Router } from 'express';
import { DocumentComparisonService } from '../../services/comparison/DocumentComparisonService.js';
import { getCanonicalDocumentService } from '../../services/canonical/CanonicalDocumentService.js';
import { ComparisonModel } from '../../models/DocumentComparison.js';
import { logger } from '../../utils/logger.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError, NotFoundError } from '../../types/errors.js';

const router = Router();
const comparisonService = new DocumentComparisonService();
const documentService = getCanonicalDocumentService();

/**
 * POST /
 * 
 * Create a new document comparison
 */
router.post('/', asyncHandler(async (req, res) => {
  const { documentAId, documentBId, options } = req.body;

  // Validate request
  if (!documentAId || !documentBId) {
    throw new BadRequestError('documentAId and documentBId are required');
  }

  // Fetch documents
  const [documentA, documentB] = await Promise.all([
    documentService.findById(documentAId),
    documentService.findById(documentBId),
  ]);

  if (!documentA) {
    throw new NotFoundError(`Document A not found: ${documentAId}`);
  }

  if (!documentB) {
    throw new NotFoundError(`Document B not found: ${documentBId}`);
  }

  // Perform comparison
  const comparison = await comparisonService.compare(documentA, documentB, options || {});

  // Persist comparison
  await ComparisonModel.create(comparison);

  // Return comparison result
  res.status(201).json(comparison);
}));

/**
 * GET /:id
 * 
 * Get comparison result by ID
 */
router.get('/comparisons/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Load comparison from database
    const comparisonDoc = await ComparisonModel.findByComparisonId(id);

    if (!comparisonDoc) {
      return res.status(404).json({
        error: 'Comparison not found',
      });
    }

    // Get document service
    const documentService = getCanonicalDocumentService();

    // Fetch documents
    const [documentA, documentB] = await Promise.all([
      documentService.findById(comparisonDoc.documentAId),
      documentService.findById(comparisonDoc.documentBId),
    ]);

    if (!documentA || !documentB) {
      return res.status(404).json({
        error: 'Referenced documents not found',
        details: {
          documentA: !documentA ? 'missing' : 'found',
          documentB: !documentB ? 'missing' : 'found',
        }
      });
    }

    // Reconstruct full comparison object
    const comparison = {
      comparisonId: comparisonDoc.comparisonId,
      documentA: documentA as CanonicalDocument,
      documentB: documentB as CanonicalDocument,
      matchedConcepts: comparisonDoc.matchedConcepts,
      differences: comparisonDoc.differences,
      summary: comparisonDoc.summary,
      confidence: comparisonDoc.confidence,
      metadata: comparisonDoc.metadata,
    };

    res.json(comparison);
  } catch (error) {
    logger.error({ error, id: req.params.id }, 'Get comparison API error');
    throw error; // Let asyncHandler handle the error response
  }
}));

/**
 * GET /:id/explanation
 * 
 * Get explanation for a comparison
 */
router.get('/:id/explanation', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const explanation = await comparisonService.generateExplanation(id);

  if (!explanation) {
    // Check if comparison exists to give better error
    const comparison = await comparisonService.getComparison(id);
    if (!comparison) {
      throw new NotFoundError('Comparison not found', id);
    }
    // Comparison exists but no explanation generated (shouldn't happen with current logic)
    throw new Error('Failed to generate explanation');
  }

  res.json({ explanation });
}));

export default router;
