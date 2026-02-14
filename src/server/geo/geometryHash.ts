/**
 * Geometry Hash Utility
 * 
 * Computes deterministic SHA-256 hash of GeoJSON geometries for idempotency.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/03-spatial-architecture.md
 */

import { createHash } from 'crypto';
import type { Geometry, FeatureCollection } from 'geojson';

/**
 * Compute geometry hash for idempotency
 * 
 * Normalizes geometry by:
 * - Sorting coordinates consistently
 * - Rounding to reasonable precision (6 decimal places for WGS84)
 * - Removing duplicate coordinates
 * 
 * @param geometry - GeoJSON geometry or FeatureCollection
 * @returns SHA-256 hash (64-character hex string)
 */
export function computeGeometryHash(geometry: Geometry | FeatureCollection): string {
  // Normalize geometry to consistent format
  const normalized = normalizeGeometry(geometry);
  
  // Serialize to JSON with consistent formatting
  const json = JSON.stringify(normalized, null, 0);
  
  // Compute hash
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Normalize geometry for consistent hashing
 */
function normalizeGeometry(geometry: Geometry | FeatureCollection): Geometry | FeatureCollection {
  if (geometry.type === 'FeatureCollection') {
    return {
      type: 'FeatureCollection',
      features: geometry.features.map(feature => ({
        type: 'Feature',
        geometry: normalizeGeometry(feature.geometry) as Geometry,
        properties: feature.properties || {},
      })),
    };
  }

  if (geometry.type === 'GeometryCollection') {
    return {
      type: 'GeometryCollection',
      geometries: geometry.geometries.map(geom => normalizeGeometry(geom) as Geometry),
    };
  }

  // Normalize coordinates for geometries that have them
  const normalized = {
    ...geometry,
    coordinates: normalizeCoordinates((geometry as any).coordinates),
  };

  return normalized as Geometry;
}

/**
 * Normalize coordinates array
 */
function normalizeCoordinates(coords: unknown): unknown {
  if (Array.isArray(coords)) {
    if (coords.length === 0) {
      return coords;
    }

    // Check if this is a position [lon, lat] or [lon, lat, elevation]
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      // Position - round to 6 decimal places (WGS84 precision)
      const rounded = coords.map((val, idx) => {
        if (typeof val === 'number') {
          // Round to 6 decimal places for coordinates
          return idx < 2 ? Math.round(val * 1e6) / 1e6 : val;
        }
        return val;
      });
      return rounded;
    }

    // Nested array - recurse
    return coords.map(coord => normalizeCoordinates(coord));
  }

  return coords;
}

