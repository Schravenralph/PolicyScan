/**
 * Plan Suite v2 - Workers Module
 * 
 * This module contains background workers for:
 * - PostGIS geo index sync worker (EP-05)
 * - Outbox pattern workers for eventual consistency
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */

export { GeoOutboxWorker } from './GeoOutboxWorker.js';
export type { GeoOutboxWorkerConfig } from './GeoOutboxWorker.js';

