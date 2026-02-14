/**
 * Shared types between client and server
 *
 * This file contains types that are used by both client and server code.
 * Server-specific types should remain in src/server/domain/ontology.ts
 */

// Re-export HierarchyLevel from server domain for client use
export type { HierarchyLevel } from '../server/domain/ontology.js';
