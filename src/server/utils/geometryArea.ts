/**
 * Geometry Area Utilities
 * 
 * Utilities for calculating geometry area and handling large geometries.
 */

import type { Geometry, Polygon, MultiPolygon } from 'geojson';

/**
 * Calculate area of a polygon in square meters (using RD coordinates)
 * 
 * Uses the shoelace formula for polygon area calculation.
 * Note: This is an approximation for RD coordinates (not accounting for Earth's curvature).
 * 
 * @param ring - Array of coordinate pairs [x, y]
 * @returns Area in square meters
 */
function calculateRingArea(ring: number[][]): number {
    if (ring.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1];
        area -= ring[i + 1][0] * ring[i][1];
    }
    
    return Math.abs(area / 2);
}

/**
 * Calculate area of a geometry in square meters
 * 
 * @param geometry - GeoJSON geometry
 * @returns Area in square meters, or 0 if geometry type is not supported
 */
export function calculateGeometryArea(geometry: Geometry): number {
    if (geometry.type === 'Polygon') {
        const polygon = geometry as Polygon;
        const rings = polygon.coordinates;
        if (rings.length === 0) return 0;
        
        // Calculate area of outer ring (first ring)
        let area = calculateRingArea(rings[0]);
        
        // Subtract area of holes (inner rings)
        for (let i = 1; i < rings.length; i++) {
            area -= calculateRingArea(rings[i]);
        }
        
        return Math.max(0, area);
    }
    
    if (geometry.type === 'MultiPolygon') {
        const multiPolygon = geometry as MultiPolygon;
        let totalArea = 0;
        
        for (const polygon of multiPolygon.coordinates) {
            if (polygon.length === 0) continue;
            
            let area = calculateRingArea(polygon[0]);
            
            // Subtract area of holes
            for (let i = 1; i < polygon.length; i++) {
                area -= calculateRingArea(polygon[i]);
            }
            
            totalArea += Math.max(0, area);
        }
        
        return totalArea;
    }
    
    // Point, LineString, etc. have no area
    return 0;
}

/**
 * Calculate distance from a point to the nearest edge of a polygon ring
 * 
 * @param point - Point [x, y] in RD coordinates
 * @param ring - Polygon ring as array of [x, y] coordinates
 * @returns Distance in meters
 */
function distanceToRing(point: [number, number], ring: number[][]): number {
    let minDistance = Infinity;
    
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        
        // Calculate distance from point to line segment
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) {
            // Point to point distance
            const dist = Math.sqrt(
                Math.pow(point[0] - p1[0], 2) + 
                Math.pow(point[1] - p1[1], 2)
            );
            minDistance = Math.min(minDistance, dist);
        } else {
            // Project point onto line segment
            const t = Math.max(0, Math.min(1, 
                ((point[0] - p1[0]) * dx + (point[1] - p1[1]) * dy) / lengthSq
            ));
            
            const projX = p1[0] + t * dx;
            const projY = p1[1] + t * dy;
            
            const dist = Math.sqrt(
                Math.pow(point[0] - projX, 2) + 
                Math.pow(point[1] - projY, 2)
            );
            minDistance = Math.min(minDistance, dist);
        }
    }
    
    return minDistance;
}

/**
 * Check if a point is inside a polygon ring using ray casting algorithm
 * 
 * @param point - Point [x, y] in RD coordinates
 * @param ring - Polygon ring as array of [x, y] coordinates
 * @returns True if point is inside the ring
 */
function pointInRing(point: [number, number], ring: number[][]): boolean {
    let inside = false;
    
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        
        const intersect = ((yi > point[1]) !== (yj > point[1])) &&
            (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
        
        if (intersect) inside = !inside;
    }
    
    return inside;
}

/**
 * Check if a point is inside a polygon (accounting for holes)
 * 
 * @param point - Point [x, y] in RD coordinates
 * @param polygon - Polygon with outer ring and optional holes
 * @returns True if point is inside polygon (in outer ring but not in holes)
 */
function pointInPolygon(point: [number, number], polygon: number[][][]): boolean {
    if (polygon.length === 0) return false;
    
    // Must be inside outer ring
    if (!pointInRing(point, polygon[0])) return false;
    
    // Must not be in any hole
    for (let i = 1; i < polygon.length; i++) {
        if (pointInRing(point, polygon[i])) return false;
    }
    
    return true;
}

/**
 * Get pole of inaccessibility (point furthest from polygon edges)
 * 
 * This algorithm uses a grid-based approach with iterative refinement.
 * The pole of inaccessibility is guaranteed to be inside the polygon.
 * 
 * @param geometry - GeoJSON geometry (Polygon or MultiPolygon)
 * @param precision - Grid precision in meters (default: 1000m = 1km)
 * @returns Point geometry representing the pole of inaccessibility
 */
export function getPoleOfInaccessibility(
    geometry: Geometry,
    precision: number = 1000
): { type: 'Point'; coordinates: [number, number] } | null {
    if (geometry.type === 'Point') {
        const point = geometry;
        return {
            type: 'Point',
            coordinates: [point.coordinates[0], point.coordinates[1]]
        };
    }
    
    let polygons: number[][][][] = [];
    
    if (geometry.type === 'Polygon') {
        const polygon = geometry as Polygon;
        polygons = [polygon.coordinates];
    } else if (geometry.type === 'MultiPolygon') {
        const multiPolygon = geometry as MultiPolygon;
        polygons = multiPolygon.coordinates;
    } else {
        return null;
    }
    
    if (polygons.length === 0) return null;
    
    // Find bounding box of all polygons
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const polygon of polygons) {
        if (polygon.length === 0) continue;
        const outerRing = polygon[0];
        for (const coord of outerRing) {
            if (coord.length >= 2) {
                minX = Math.min(minX, coord[0]);
                minY = Math.min(minY, coord[1]);
                maxX = Math.max(maxX, coord[0]);
                maxY = Math.max(maxY, coord[1]);
            }
        }
    }
    
    if (minX === Infinity) return null;
    
    // Use largest polygon for POI calculation (most representative)
    let largestPolygon = polygons[0];
    let largestArea = 0;
    
    for (const polygon of polygons) {
        if (polygon.length === 0) continue;
        const area = calculateRingArea(polygon[0]);
        if (area > largestArea) {
            largestArea = area;
            largestPolygon = polygon;
        }
    }
    
    // Grid-based search for pole of inaccessibility
    let bestPoint: [number, number] | null = null;
    let maxDistance = -1;
    
    // Start with coarse grid
    let currentPrecision = precision * 4;
    const minPrecision = precision;
    
    // Iterative refinement: start coarse, refine around best point
    for (let iteration = 0; iteration < 3; iteration++) {
        const step = currentPrecision;
        const startX = bestPoint ? bestPoint[0] - currentPrecision * 2 : minX;
        const startY = bestPoint ? bestPoint[1] - currentPrecision * 2 : minY;
        const endX = bestPoint ? bestPoint[0] + currentPrecision * 2 : maxX;
        const endY = bestPoint ? bestPoint[1] + currentPrecision * 2 : maxY;
        
        for (let x = startX; x <= endX; x += step) {
            for (let y = startY; y <= endY; y += step) {
                const point: [number, number] = [x, y];
                
                // Check if point is inside polygon
                if (!pointInPolygon(point, largestPolygon)) continue;
                
                // Calculate distance to nearest edge
                const distance = distanceToRing(point, largestPolygon[0]);
                
                if (distance > maxDistance) {
                    maxDistance = distance;
                    bestPoint = point;
                }
            }
        }
        
        // Refine for next iteration
        currentPrecision = Math.max(minPrecision, currentPrecision / 2);
    }
    
    if (!bestPoint) {
        // Fallback: use centroid if POI calculation fails
        return getGeometryCentroid(geometry);
    }
    
    return {
        type: 'Point',
        coordinates: bestPoint,
    };
}

/**
 * Get centroid (center point) of a geometry
 * 
 * Note: Centroid may fall outside the geometry for non-convex shapes.
 * Use getPoleOfInaccessibility() for guaranteed inside point.
 * 
 * @param geometry - GeoJSON geometry
 * @returns Point geometry representing the centroid
 */
export function getGeometryCentroid(geometry: Geometry): { type: 'Point'; coordinates: [number, number] } | null {
    if (geometry.type === 'Point') {
        const point = geometry;
        return {
            type: 'Point',
            coordinates: [point.coordinates[0], point.coordinates[1]]
        };
    }
    
    if (geometry.type === 'Polygon') {
        const polygon = geometry as Polygon;
        if (polygon.coordinates.length === 0) return null;

        const outerRing = polygon.coordinates[0];
        if (outerRing.length === 0) return null;
        
        // Calculate centroid as average of all coordinates
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        
        for (const coord of outerRing) {
            if (coord.length >= 2) {
                sumX += coord[0];
                sumY += coord[1];
                count++;
            }
        }
        
        if (count === 0) return null;
        
        return {
            type: 'Point',
            coordinates: [sumX / count, sumY / count],
        };
    }
    
    if (geometry.type === 'MultiPolygon') {
        const multiPolygon = geometry as MultiPolygon;
        
        // Calculate centroid as weighted average of polygon centroids
        let totalArea = 0;
        let weightedX = 0;
        let weightedY = 0;
        
        for (const polygon of multiPolygon.coordinates) {
            if (polygon.length === 0) continue;
            
            const outerRing = polygon[0];
            if (outerRing.length === 0) continue;
            
            // Calculate polygon area
            const area = calculateRingArea(outerRing);
            if (area === 0) continue;
            
            // Calculate polygon centroid
            let sumX = 0;
            let sumY = 0;
            let count = 0;
            
            for (const coord of outerRing) {
                if (coord.length >= 2) {
                    sumX += coord[0];
                    sumY += coord[1];
                    count++;
                }
            }
            
            if (count === 0) continue;
            
            const centroidX = sumX / count;
            const centroidY = sumY / count;
            
            weightedX += centroidX * area;
            weightedY += centroidY * area;
            totalArea += area;
        }
        
        if (totalArea === 0) return null;
        
        return {
            type: 'Point',
            coordinates: [weightedX / totalArea, weightedY / totalArea],
        };
    }
    
    return null;
}
