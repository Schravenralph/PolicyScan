/**
 * Geoportaal Documents with Geometry API Routes
 * 
 * Provides endpoint for retrieving documents with geometry data for map visualization.
 * 
 * @see docs/geoportaal-api-spec.md
 */

import express, { Router, Request, Response } from 'express';
import { validate } from '../../middleware/validation.js';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError } from '../../types/errors.js';
import { geoportaalSchemas } from '../../validation/geoportaalSchemas.js';
import { DocumentsWithGeometryService } from '../../services/geoportaal/DocumentsWithGeometryService.js';

const router: Router = express.Router();
const documentsWithGeometryService = new DocumentsWithGeometryService();

/**
 * GET /api/documents/with-geometry
 * Get documents with geometry data
 * 
 * Query parameters:
 * - limit (optional): Maximum number of documents to return (default: 100, max: 1000)
 * - offset (optional): Number of documents to skip for pagination (default: 0)
 * - source (optional): Filter by source identifier
 * - municipalityCode (optional): Filter by municipality code
 * - documentType (optional): Filter by document type
 * - bbox (optional): Bounding box filter in format "minLon,minLat,maxLon,maxLat"
 * 
 * Returns documents with their geometry data in GeoJSON format (WGS84/EPSG:4326).
 */
router.get(
  '/with-geometry',
  validate(geoportaalSchemas.getDocumentsWithGeometry),
  asyncHandler(async (req: Request, res: Response) => {
    // Validation schema has already parsed and validated the query parameters
    const query = req.query as {
      limit?: number;
      offset?: number;
      source?: string;
      municipalityCode?: string;
      documentType?: string;
      bbox?: [number, number, number, number];
    };

    // Apply defaults if not provided
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    // Build filters (validation schema has already parsed bbox if provided)
    const filters: {
      source?: string;
      municipalityCode?: string;
      documentType?: string;
      bbox?: [number, number, number, number];
    } = {};

    if (query.source) {
      filters.source = query.source;
    }

    if (query.municipalityCode) {
      filters.municipalityCode = query.municipalityCode;
    }

    if (query.documentType) {
      filters.documentType = query.documentType;
    }

    if (query.bbox) {
      filters.bbox = query.bbox;
    }

    // Query documents with geometry
    const result = await documentsWithGeometryService.findDocumentsWithGeometry(filters, {
      limit,
      offset,
    });

    res.json(result);
  })
);

export default router;
