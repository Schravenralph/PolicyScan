/**
 * Ingestion Layer - Main exports
 * 
 * Central export point for the ingestion layer.
 */

// Main service
export { IngestionOrchestrator } from './IngestionOrchestrator.js';
export type { IngestionOrchestratorConfig } from './IngestionOrchestrator.js';

// Interfaces
export type { IIngestionService } from './interfaces/IIngestionService.js';
export type { IIngestionAdapter } from './interfaces/IIngestionAdapter.js';

// Normalizers
export { DocumentNormalizer } from './normalizers/DocumentNormalizer.js';

// Deduplicators
export { DocumentDeduplicator } from './deduplicators/DocumentDeduplicator.js';
export type { DeduplicationOptions } from './deduplicators/DocumentDeduplicator.js';

// Adapters
export { DsoIngestionAdapter } from './adapters/DsoIngestionAdapter.js';
export type { DsoIngestionAdapterConfig } from './adapters/DsoIngestionAdapter.js';
export { IploIngestionAdapter } from './adapters/IploIngestionAdapter.js';
export type { IploIngestionAdapterConfig } from './adapters/IploIngestionAdapter.js';
export { WebIngestionAdapter } from './adapters/WebIngestionAdapter.js';
export type { WebIngestionAdapterConfig } from './adapters/WebIngestionAdapter.js';
export { CommonCrawlIngestionAdapter } from './adapters/CommonCrawlIngestionAdapter.js';
export type { CommonCrawlIngestionAdapterConfig } from './adapters/CommonCrawlIngestionAdapter.js';

// Types
export type { IngestionResult, IngestionMetadata } from './types/IngestionResult.js';
export type { NormalizedDocument } from './types/NormalizedDocument.js';
export type { RawDocument } from './types/RawDocument.js';
export type { IngestionOptions } from './types/IngestionOptions.js';
export type { DeduplicationResult } from './types/DeduplicationResult.js';