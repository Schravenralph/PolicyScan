/**
 * Geoportaal API Validation Schemas
 * 
 * Zod schemas for validating Geoportaal API requests.
 * Used by the /api/documents/with-geometry route.
 */

import { z } from 'zod';

/**
 * Bbox validation schema
 * Format: "minLon,minLat,maxLon,maxLat" (comma-separated string)
 */
const bboxStringSchema = z
  .string()
  .regex(
    /^-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*,-?\d+\.?\d*$/,
    'bbox must be in format "minLon,minLat,maxLon,maxLat" (4 comma-separated numbers)'
  )
  .transform((str) => {
    const parts = str.split(',');
    if (parts.length !== 4) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: [],
          message: 'bbox must contain exactly 4 comma-separated numbers',
        },
      ]);
    }
    const [minLon, minLat, maxLon, maxLat] = parts.map((p) => parseFloat(p));
    
    // Validate numeric values
    if (isNaN(minLon) || isNaN(minLat) || isNaN(maxLon) || isNaN(maxLat)) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: [],
          message: 'bbox must contain valid numbers',
        },
      ]);
    }
    
    // Validate bbox bounds
    if (minLon >= maxLon || minLat >= maxLat) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: [],
          message: 'bbox must have minLon < maxLon and minLat < maxLat',
        },
      ]);
    }
    
    return [minLon, minLat, maxLon, maxLat] as [number, number, number, number];
  });

/**
 * Validation schemas for Geoportaal API endpoints
 */
export const geoportaalSchemas = {
  /**
   * GET /api/documents/with-geometry
   * Get documents with geometry
   */
  getDocumentsWithGeometry: {
    query: z.object({
      limit: z
        .string()
        .regex(/^\d+$/, 'limit must be a positive integer')
        .transform((str) => parseInt(str, 10))
        .pipe(z.number().int().positive().max(1000))
        .optional(),
      offset: z
        .string()
        .regex(/^\d+$/, 'offset must be a non-negative integer')
        .transform((str) => parseInt(str, 10))
        .pipe(z.number().int().nonnegative())
        .optional(),
      source: z.string().min(1).optional(),
      municipalityCode: z.string().min(1).optional(),
      documentType: z.string().min(1).optional(),
      bbox: bboxStringSchema.optional(),
    }),
  },
};
