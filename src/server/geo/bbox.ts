/**
 * Bbox Utility
 * 
 * Computes bounding box from GeoJSON geometries.
 */

import type { Geometry } from 'geojson';

/**
 * Compute bounding box from geometries
 * 
 * @param geometries - Array of GeoJSON geometries (must be WGS84)
 * @returns Bbox as [minLon, minLat, maxLon, maxLat]
 */
export function computeBbox(geometries: Geometry[]): [number, number, number, number] {
  if (geometries.length === 0) {
    throw new Error('Cannot compute bbox from empty geometry array');
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const geometry of geometries) {
    const coords = extractCoordinates(geometry);
    
    for (const coord of coords) {
      const [lon, lat] = coord;
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Extract all coordinates from geometry
 */
function extractCoordinates(geometry: Geometry): number[][] {
  const coords: number[][] = [];

  function traverse(coordsArray: unknown): void {
    if (Array.isArray(coordsArray)) {
      if (coordsArray.length >= 2 && typeof coordsArray[0] === 'number' && typeof coordsArray[1] === 'number') {
        // Position [lon, lat] or [lon, lat, elevation]
        coords.push([coordsArray[0], coordsArray[1]]);
      } else {
        // Nested array
        for (const item of coordsArray) {
          traverse(item);
        }
      }
    }
  }

  switch (geometry.type) {
    case 'Point':
      coords.push(geometry.coordinates);
      break;
    case 'LineString':
    case 'MultiPoint':
      traverse(geometry.coordinates);
      break;
    case 'Polygon':
    case 'MultiLineString':
      traverse(geometry.coordinates);
      break;
    case 'MultiPolygon':
      traverse(geometry.coordinates);
      break;
    case 'GeometryCollection':
      for (const geom of geometry.geometries) {
        const geomCoords = extractCoordinates(geom);
        coords.push(...geomCoords);
      }
      break;
  }

  return coords;
}

