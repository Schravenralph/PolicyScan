/**
 * Geometry Precision Utilities
 * 
 * Utilities for rounding geometry coordinates to meet API requirements.
 * DSO Ontsluiten v2 API requires coordinates with maximum 3 decimal places.
 */

import type { Geometry } from 'geojson';

/**
 * Round a number to specified decimal places
 */
function roundToDecimals(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/**
 * Round coordinates in a coordinate array to specified decimal places
 */
function roundCoordinates(coords: number[], decimals: number): number[] {
    return coords.map(coord => roundToDecimals(coord, decimals));
}

/**
 * Round all coordinates in a geometry to specified decimal places
 * 
 * @param geometry - GeoJSON geometry
 * @param decimals - Number of decimal places (default: 3 for DSO API)
 * @returns New geometry with rounded coordinates
 */
export function roundGeometryCoordinates(geometry: Geometry, decimals: number = 3): Geometry {
    // GeometryCollection doesn't have coordinates property
    if (geometry.type === 'GeometryCollection') {
        return geometry;
    }

    const geometryWithCoords = geometry as Exclude<Geometry, { type: 'GeometryCollection' }>;
    if (!geometryWithCoords.coordinates) {
        return geometry;
    }

    const roundCoord = (coord: any): any => {
        if (typeof coord === 'number') {
            return roundToDecimals(coord, decimals);
        }
        if (Array.isArray(coord)) {
            if (coord.length > 0 && typeof coord[0] === 'number') {
                // This is a coordinate pair/triplet
                return roundCoordinates(coord as number[], decimals);
            }
            // This is a nested array
            return coord.map(roundCoord);
        }
        return coord;
    };

    return {
        ...geometryWithCoords,
        coordinates: roundCoord(geometryWithCoords.coordinates),
    } as Geometry;
}
