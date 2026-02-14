/**
 * Ensure Canonical Collections Indexes
 * 
 * Idempotent function to ensure all canonical collection indexes exist.
 * Can be called at server startup or as part of migrations.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 */

import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Ensure all canonical collection indexes exist
 * This function is idempotent - safe to call multiple times
 */
export async function ensureCanonicalIndexes(): Promise<void> {
  const db = getDB();
  
  try {
    // Ensure canonical_documents indexes
    const documentsCollection = db.collection('canonical_documents');
    
    await documentsCollection.createIndex(
      { source: 1, sourceId: 1 },
      { unique: true, sparse: true, name: 'idx_source_sourceId', background: true }
    ).catch(() => {}); // Ignore if already exists
    
    await documentsCollection.createIndex(
      { contentFingerprint: 1 },
      { name: 'idx_contentFingerprint', background: true }
    ).catch(() => {});
    
    await documentsCollection.createIndex(
      { documentFamily: 1, documentType: 1 },
      { name: 'idx_family_type', background: true }
    ).catch(() => {});
    
    await documentsCollection.createIndex(
      { createdAt: -1 },
      { name: 'idx_createdAt', background: true }
    ).catch(() => {});
    
    // Index on canonicalUrl for URL-based document matching (WI-DOCUMENT-IDENTITY-001)
    await documentsCollection.createIndex(
      { canonicalUrl: 1 },
      { name: 'idx_canonicalUrl', background: true, sparse: true }
    ).catch(() => {}); // Ignore if already exists
    
    // Index on sourceMetadata.legacyUrl for legacy URL matching
    await documentsCollection.createIndex(
      { 'sourceMetadata.legacyUrl': 1 },
      { name: 'idx_legacyUrl', background: true, sparse: true }
    ).catch(() => {});
    
    // Index on sourceMetadata.url for URL matching
    await documentsCollection.createIndex(
      { 'sourceMetadata.url': 1 },
      { name: 'idx_sourceMetadata_url', background: true, sparse: true }
    ).catch(() => {});
    
    // Index on sourceMetadata.discovery.identificatie for DSO AKN/IMRO identifier matching
    await documentsCollection.createIndex(
      { 'sourceMetadata.discovery.identificatie': 1 },
      { name: 'idx_discovery_identificatie', background: true, sparse: true }
    ).catch(() => {});
    
    // Text index for keyword search (WI-DB-002)
    // Includes Dutch language support for better text search
    // Weights: title matches weighted 10x higher than fullText matches
    try {
      await documentsCollection.createIndex(
        { title: 'text', fullText: 'text' },
        { 
          name: 'idx_text_search', 
          default_language: 'nl', // Dutch language analyzer
          weights: { title: 10, fullText: 1 },
          background: true
        }
      ).catch(() => {}); // Ignore if already exists
      logger.debug('Text index on canonical_documents ensured');
    } catch (error) {
      // Text index may fail if not supported (e.g., sharded cluster, apiStrict mode)
      logger.warn({ error }, 'Could not ensure text index (may not be supported)');
    }
    
    // Ensure canonical_chunks indexes
    const chunksCollection = db.collection('canonical_chunks');
    
    await chunksCollection.createIndex(
      { chunkId: 1 },
      { unique: true, name: 'idx_chunkId', background: true }
    ).catch(() => {});
    
    await chunksCollection.createIndex(
      { documentId: 1, chunkIndex: 1 },
      { name: 'idx_documentId_chunkIndex', background: true }
    ).catch(() => {});
    
    await chunksCollection.createIndex(
      { chunkFingerprint: 1 },
      { name: 'idx_chunkFingerprint', background: true }
    ).catch(() => {});
    
    await chunksCollection.createIndex(
      { documentId: 1 },
      { name: 'idx_documentId', background: true }
    ).catch(() => {});
    
    // Ensure extensions indexes
    const geoExtensionsCollection = db.collection('geo_extensions');
    await geoExtensionsCollection.createIndex(
      { documentId: 1 },
      { unique: true, name: 'idx_geo_documentId', background: true }
    ).catch(() => {});
    
    const legalExtensionsCollection = db.collection('legal_extensions');
    await legalExtensionsCollection.createIndex(
      { documentId: 1 },
      { unique: true, name: 'idx_legal_documentId', background: true }
    ).catch(() => {});
    
    const webExtensionsCollection = db.collection('web_extensions');
    await webExtensionsCollection.createIndex(
      { documentId: 1 },
      { unique: true, name: 'idx_web_documentId', background: true }
    ).catch(() => {});
    
    // Ensure outbox indexes
    const outboxCollection = db.collection('outbox');
    await outboxCollection.createIndex(
      { status: 1, createdAt: 1 },
      { name: 'idx_outbox_status_createdAt', background: true }
    ).catch(() => {});
    
    await outboxCollection.createIndex(
      { documentId: 1 },
      { name: 'idx_outbox_documentId', background: true }
    ).catch(() => {});
    
    logger.debug('Canonical collection indexes ensured');
  } catch (error) {
    logger.warn({ error }, 'Failed to ensure some canonical indexes');
    // Don't throw - indexes can be created later via migration
  }
}

