#!/usr/bin/env tsx
/**
 * Migration: Create Municipality Geometries Collection
 * 
 * Creates collection and indexes for caching municipality geometries from DSO Geometrie Opvragen API.
 * 
 * Collection: municipality_geometries
 * 
 * @see docs/30-dso-geometrie-opvragen/functionele-documentatie-geometrie-opvragen-v1-api.md
 * 
 * Usage:
 *   tsx src/server/db/migrations/002-create-municipality-geometries-collection.ts
 */

import { fileURLToPath } from 'url';
import { connectDB, closeDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { BevoegdgezagGeometryModel } from '../../models/BevoegdgezagGeometry.js';

async function createMunicipalityGeometriesCollection(): Promise<void> {
  logger.info('Creating municipality_geometries collection and indexes...');
  
  // Use the model's ensureIndexes method which handles all index creation
  await BevoegdgezagGeometryModel.ensureIndexes();
  
  logger.info('✅ Municipality geometries collection and indexes created successfully');
}

async function main(): Promise<void> {
  try {
    await connectDB();
    await createMunicipalityGeometriesCollection();
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
