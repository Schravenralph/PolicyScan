#!/usr/bin/env tsx
/**
 * Migration: Create Canonical Collections and Indexes
 * 
 * Creates collections and indexes for canonical document parsing:
 * - canonical_documents
 * - canonical_chunks
 * - extensions (single collection for geo/legal/web extensions)
 * - outbox (for eventual consistency)
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/01-canonical-model.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/13-migrations-and-backfills.md
 * 
 * Usage:
 *   tsx src/server/db/migrations/001-create-canonical-collections.ts
 */

import { fileURLToPath } from 'url';
import { connectDB, closeDB, getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

async function createCanonicalCollections(): Promise<void> {
  const db = getDB();
  
  logger.info('Creating canonical collections and indexes...');
  
  // Create canonical_documents collection and indexes
  const documentsCollection = db.collection('canonical_documents');
  
  // Unique index on (source, sourceId) - sparse to allow null sourceId
  await documentsCollection.createIndex(
    { source: 1, sourceId: 1 },
    { unique: true, sparse: true, name: 'idx_source_sourceId' }
  );
  
  // Index on contentFingerprint for deduplication
  await documentsCollection.createIndex(
    { contentFingerprint: 1 },
    { name: 'idx_contentFingerprint' }
  );
  
  // Index on documentFamily and documentType for filtering
  await documentsCollection.createIndex(
    { documentFamily: 1, documentType: 1 },
    { name: 'idx_family_type' }
  );
  
  // Index on createdAt for sorting
  await documentsCollection.createIndex(
    { createdAt: -1 },
    { name: 'idx_createdAt' }
  );
  
  // Optional text index on title and fullText (if not using Atlas Search)
  // Includes Dutch language support for better text search
  try {
    await documentsCollection.createIndex(
      { title: 'text', fullText: 'text' },
      { 
        name: 'idx_text_search', 
        default_language: 'nl', // Dutch language analyzer
        weights: { title: 10, fullText: 1 } 
      }
    );
    logger.info('Created text index on canonical_documents with Dutch language support');
  } catch (error) {
    // Text index may fail if not supported (e.g., sharded cluster)
    logger.warn({ error }, 'Could not create text index (may not be supported)');
  }
  
  logger.info('Created canonical_documents collection and indexes');
  
  // Create canonical_chunks collection and indexes
  const chunksCollection = db.collection('canonical_chunks');
  
  // Unique index on chunkId
  await chunksCollection.createIndex(
    { chunkId: 1 },
    { unique: true, name: 'idx_chunkId' }
  );
  
  // Index on documentId and chunkIndex for document queries
  await chunksCollection.createIndex(
    { documentId: 1, chunkIndex: 1 },
    { name: 'idx_documentId_chunkIndex' }
  );
  
  // Index on chunkFingerprint for deduplication
  await chunksCollection.createIndex(
    { chunkFingerprint: 1 },
    { name: 'idx_chunkFingerprint' }
  );
  
  // Index on documentId for finding all chunks of a document
  await chunksCollection.createIndex(
    { documentId: 1 },
    { name: 'idx_documentId' }
  );
  
  logger.info('Created canonical_chunks collection and indexes');
  
  // Create extensions collection (single collection for all extension types)
  const extensionsCollection = db.collection('extensions');
  
  // Unique index on (documentId, type) - idempotency key
  await extensionsCollection.createIndex(
    { documentId: 1, type: 1 },
    { unique: true, name: 'idx_documentId_type' }
  );
  
  // Index on documentId for lookups
  await extensionsCollection.createIndex(
    { documentId: 1 },
    { name: 'idx_documentId' }
  );
  
  // Index on type for filtering
  await extensionsCollection.createIndex(
    { type: 1 },
    { name: 'idx_type' }
  );
  
  // Index on createdAt for sorting
  await extensionsCollection.createIndex(
    { createdAt: -1 },
    { name: 'idx_createdAt' }
  );
  
  // Compound index on (type, updatedAt) for filtering by type and sorting by update time
  // Useful for queries like "get all geo extensions updated recently"
  await extensionsCollection.createIndex(
    { type: 1, updatedAt: -1 },
    { name: 'idx_type_updatedAt', background: true }
  );
  
  logger.info('Created extensions collection and indexes');
  
  // Create outbox collection for eventual consistency
  const outboxCollection = db.collection('outbox');
  
  // Index on status and createdAt for processing
  await outboxCollection.createIndex(
    { status: 1, createdAt: 1 },
    { name: 'idx_outbox_status_createdAt' }
  );
  
  // Index on documentId for lookups
  await outboxCollection.createIndex(
    { documentId: 1 },
    { name: 'idx_outbox_documentId' }
  );
  
  logger.info('Created outbox collection and indexes');
  
  logger.info('✅ All canonical collections and indexes created successfully');
}

async function main(): Promise<void> {
  try {
    await connectDB();
    await createCanonicalCollections();
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    process.exit(1);
  } finally {
    await closeDB();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    logger.error({ error }, 'Unhandled error in migration');
    process.exit(1);
  });
}

