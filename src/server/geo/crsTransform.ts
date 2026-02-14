/**
 * CRS Transformation Utility
 * 
 * Provides deterministic coordinate reference system transformations,
 * primarily EPSG:28992 (Dutch RD) → EPSG:4326 (WGS84).
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/03-spatial-architecture.md
 */

import proj4 from 'proj4';
import type { Geometry, Position } from 'geojson';

// Define EPSG:28992 (Dutch RD) projection
// Parameters from EPSG registry
const EPSG28992_DEF = '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.2369,50.0087,465.658,-0.406857330322398,0.350732676542563,-1.87035,4.0812 +units=m +no_defs';

// Define EPSG:4326 (WGS84) projection
const EPSG4326_DEF = '+proj=longlat +datum=WGS84 +no_defs';

/**
 * Transform coordinates from EPSG:28992 (RD) to EPSG:4326 (WGS84)
 * 
 * @param x - RD X coordinate (easting)
 * @param y - RD Y coordinate (northing)
 * @returns WGS84 coordinates [longitude, latitude]
 */
export function transformRdToWgs84(x: number, y: number): [number, number] {
  const [lon, lat] = proj4(EPSG28992_DEF, EPSG4326_DEF, [x, y]);
  return [lon, lat];
}

/**
 * Transform coordinates from EPSG:4326 (WGS84) to EPSG:28992 (RD)
 * 
 * @param lon - WGS84 longitude
 * @param lat - WGS84 latitude
 * @returns RD coordinates [x, y]
 */
export function transformWgs84ToRd(lon: number, lat: number): [number, number] {
  const [x, y] = proj4(EPSG4326_DEF, EPSG28992_DEF, [lon, lat]);
  return [x, y];
}

/**
 * Transform a GeoJSON position array
 * 
 * @param position - GeoJSON position [lon, lat] or [lon, lat, elevation]
 * @param fromCrs - Source CRS (e.g., 'EPSG:28992')
 * @param toCrs - Target CRS (e.g., 'EPSG:4326')
 * @returns Transformed position
 */
export function transformPosition(
  position: Position,
  fromCrs: string,
  toCrs: string
): Position {
  if (fromCrs === toCrs) {
    return position;
  }

  let fromDef: string;
  let toDef: string;

  if (fromCrs === 'EPSG:28992') {
    fromDef = EPSG28992_DEF;
  } else if (fromCrs === 'EPSG:4326') {
    fromDef = EPSG4326_DEF;
  } else {
    throw new Error(`Unsupported source CRS: ${fromCrs}`);
  }

  if (toCrs === 'EPSG:28992') {
    toDef = EPSG28992_DEF;
  } else if (toCrs === 'EPSG:4326') {
    toDef = EPSG4326_DEF;
  } else {
    throw new Error(`Unsupported target CRS: ${toCrs}`);
  }

  const [x, y] = proj4(fromDef, toDef, [position[0], position[1]]);
  
  // Preserve elevation if present
  if (position.length >= 3) {
    return [x, y, ...position.slice(2)] as Position;
  }
  
  return [x, y];
}

/**
 * Transform a GeoJSON geometry
 * 
 * Recursively transforms all coordinates in the geometry.
 * 
 * @param geometry - GeoJSON geometry
 * @param fromCrs - Source CRS (e.g., 'EPSG:28992')
 * @param toCrs - Target CRS (e.g., 'EPSG:4326')
 * @returns Transformed geometry
 */
export function transformGeometry(
  geometry: Geometry,
  fromCrs: string,
  toCrs: string
): Geometry {
  if (fromCrs === toCrs) {
    return geometry;
  }

  const transformCoords = (coords: unknown[]): unknown[] => {
    if (Array.isArray(coords[0])) {
      // Nested array (LineString, Polygon, etc.)
      return coords.map(coord => transformCoords(coord as unknown[]));
    } else if (typeof coords[0] === 'number') {
      // Position [lon, lat] or [lon, lat, elevation]
      return transformPosition(coords as Position, fromCrs, toCrs);
    }
    return coords;
  };

  switch (geometry.type) {
    case 'Point':
      return {
        ...geometry,
        coordinates: transformPosition(geometry.coordinates, fromCrs, toCrs),
      };
    case 'LineString':
    case 'MultiPoint':
      return {
        ...geometry,
        coordinates: transformCoords(geometry.coordinates as unknown[]) as Position[],
      };
    case 'Polygon':
    case 'MultiLineString':
      return {
        ...geometry,
        coordinates: transformCoords(geometry.coordinates as unknown[]) as Position[][],
      };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: transformCoords(geometry.coordinates as unknown[]) as Position[][][],
      };
    case 'GeometryCollection':
      return {
        ...geometry,
        geometries: geometry.geometries.map(geom => transformGeometry(geom, fromCrs, toCrs)),
      };
    default:
      throw new Error(`Unsupported geometry type: ${(geometry as { type: string }).type}`);
  }
}

