/**
 * Shared Database Helpers for Admin Routes
 * 
 * Common database operation helpers used across admin route handlers.
 */

import { getDB, ensureDBConnection } from '../../../config/database.js';
import { handleDatabaseOperation } from '../../../utils/databaseErrorHandler.js';
import { throwIfNotFound } from '../../../utils/errorHandling.js';
import type { Collection, Db } from 'mongodb';

/**
 * Get database instance (with connection check)
 * 
 * @returns MongoDB database instance
 */
export async function getDatabase(): Promise<Db> {
    return await ensureDBConnection();
}

/**
 * Get database instance (without connection check - for compatibility)
 * 
 * @returns MongoDB database instance
 */
export function getDatabaseSync(): Db {
    return getDB();
}

/**
 * Get collection with type safety
 * 
 * @param db - Database instance
 * @param name - Collection name
 * @returns Typed collection
 */
export function getCollection<T extends Record<string, unknown>>(db: Db, name: string): Collection<T> {
    return db.collection<T>(name);
}

/**
 * Execute database operation with error handling
 * 
 * @param operation - Database operation function
 * @param operationName - Name of operation for logging
 * @returns Operation result
 */
export async function executeDatabaseOperation<T>(
    operation: () => Promise<T>,
    operationName: string
): Promise<T> {
    return await handleDatabaseOperation(operation, operationName);
}

/**
 * Find document by ID or throw if not found
 * 
 * @param collection - MongoDB collection
 * @param id - Document ID
 * @param resourceName - Name of resource for error messages
 * @returns Found document
 * @throws NotFoundError if document not found
 */
export async function findByIdOrThrow<T extends Record<string, unknown>>(
    collection: Collection<T>,
    id: string,
    resourceName: string = 'Resource'
): Promise<T> {
    const { ObjectId } = await import('mongodb');
    const document = await collection.findOne({ _id: new ObjectId(id) } as any);
    throwIfNotFound(document, resourceName, id);
    return document as T;
}

