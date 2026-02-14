import { Router } from 'express';
import { DocumentComparisonService } from '../services/comparison/DocumentComparisonService.js';
import { getCanonicalDocumentService } from '../services/canonical/CanonicalDocumentService.js';
import { ComparisonModel } from '../models/DocumentComparison.js';
import { AuthService } from '../services/auth/AuthService.js';
import { asyncHandler } from '../utils/errorHandling.js';
import type { CanonicalDocument } from '../contracts/types.js';
import { BadRequestError, NotFoundError } from '../types/errors.js';

export function createComparisonRoutes(_authService: AuthService): Router {
  const router = Router();
  const comparisonService = new DocumentComparisonService();
  const documentService = getCanonicalDocumentService();

  /**
   * POST /api/comparisons
   * Compare two documents
   */
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { documentAId, documentBId, options } = req.body;

      if (!documentAId || !documentBId) {
        throw new BadRequestError('documentAId and documentBId are required');
      }

      const [docA, docB] = await Promise.all([
        documentService.findById(documentAId),
        documentService.findById(documentBId),
      ]);

      if (!docA) {
        throw new NotFoundError('Document A not found', documentAId);
      }
      if (!docB) {
        throw new NotFoundError('Document B not found', documentBId);
      }

      const result = await comparisonService.compare(docA, docB, options);

      // Persist comparison
      await ComparisonModel.create(result);

      res.json(result);
    })
  );

  /**
   * GET /api/comparisons/:id
   * Get comparison result by ID
   */
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { id } = req.params;

      // Load comparison from database
      const comparisonDoc = await ComparisonModel.findByComparisonId(id);

      if (!comparisonDoc) {
        throw new NotFoundError('Comparison not found', id);
      }

      // Fetch documents
      const [docA, docB] = await Promise.all([
        documentService.findById(comparisonDoc.documentAId),
        documentService.findById(comparisonDoc.documentBId),
      ]);

      if (!docA) {
        throw new NotFoundError('Referenced Document A not found', comparisonDoc.documentAId);
      }
      if (!docB) {
        throw new NotFoundError('Referenced Document B not found', comparisonDoc.documentBId);
      }

      // Reconstruct full comparison object
      const result = {
        comparisonId: comparisonDoc.comparisonId,
        documentA: docA as CanonicalDocument,
        documentB: docB as CanonicalDocument,
        matchedConcepts: comparisonDoc.matchedConcepts,
        differences: comparisonDoc.differences,
        summary: comparisonDoc.summary,
        confidence: comparisonDoc.confidence,
        metadata: comparisonDoc.metadata,
      };

      res.json(result);
    })
  );

  return router;
}
