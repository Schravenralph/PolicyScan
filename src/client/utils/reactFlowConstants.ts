/**
 * Shared React Flow constants
 * 
 * These constants are defined once and reused across all React Flow components
 * to avoid the "new nodeTypes/edgeTypes object" warning.
 * 
 * React Flow detects when nodeTypes or edgeTypes objects are recreated on each render,
 * which causes performance issues. By defining them here as module-level constants,
 * we ensure all components use the same object references.
 * 
 * Using Object.freeze to ensure they are truly immutable and React Flow can detect
 * they are stable references.
 */

export const DEFAULT_NODE_TYPES = Object.freeze({});
export const DEFAULT_EDGE_TYPES = Object.freeze({});
