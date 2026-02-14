import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';
import { handleDatabaseOperation, DatabaseValidationError } from '../utils/databaseErrorHandler.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const COLLECTION_NAME = 'api_keys';

/**
 * API Key MongoDB Document
 * 
 * Stores API keys for external services like Geoportaal.
 * Keys are hashed before storage for security.
 */
export interface ApiKeyDocument {
  _id?: ObjectId;
  keyHash: string; // SHA-256 hash of the API key
  name: string; // Human-readable name/description (e.g., "Geoportaal Reports API")
  isActive: boolean; // Whether the key is active
  createdAt: Date; // When the key was created
  expiresAt: Date; // When the key expires (365 days from creation)
  lastUsedAt?: Date; // When the key was last used
  createdBy?: string; // User ID who created the key (optional)
}

/**
 * Input for creating an API key
 */
export interface ApiKeyCreateInput {
  name: string;
  expiresInDays?: number; // Default: 365 days
  createdBy?: string;
}

/**
 * API Key Model
 * 
 * Manages API keys for external services with expiration support.
 * Keys are hashed using SHA-256 before storage.
 */
export class ApiKey {
  private static indexesEnsured = false;

  /**
   * Ensure database indexes exist
   */
  static async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;

    const db = getDB();
    const collection = db.collection<ApiKeyDocument>(COLLECTION_NAME);

    try {
      // TTL index for automatic deletion after expiration
      await collection.createIndex(
        { expiresAt: 1 },
        {
          expireAfterSeconds: 0, // TTL index - documents expire when expiresAt date is reached
          name: 'api_keys_ttl_index'
        }
      );

      // Index on keyHash for lookups
      await collection.createIndex(
        { keyHash: 1 },
        { unique: true, name: 'idx_keyHash' }
      );

      // Index on isActive for filtering active keys
      await collection.createIndex(
        { isActive: 1 },
        { name: 'idx_isActive' }
      );

      // Index on name for searching
      await collection.createIndex(
        { name: 1 },
        { name: 'idx_name' }
      );

      this.indexesEnsured = true;
      logger.debug('ApiKey indexes created successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to create ApiKey indexes');
      throw error;
    }
  }

  /**
   * Hash an API key using SHA-256
   */
  private static hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Generate a secure random API key
   * Returns the plaintext key (should be shown to user once, then discarded)
   */
  static generateKey(): string {
    // Generate a 64-character hex string (32 bytes = 256 bits)
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new API key
   * 
   * @param input - API key creation input
   * @returns Object with the API key document and the plaintext key (show once only)
   */
  static async create(input: ApiKeyCreateInput): Promise<{
    document: ApiKeyDocument;
    plaintextKey: string;
  }> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<ApiKeyDocument>(COLLECTION_NAME);

      // Generate the plaintext key
      const plaintextKey = this.generateKey();
      const keyHash = this.hashKey(plaintextKey);

      // Calculate expiration date (default: 365 days)
      const expiresInDays = input.expiresInDays ?? 365;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

      const document: Omit<ApiKeyDocument, '_id'> = {
        keyHash,
        name: input.name,
        isActive: true,
        createdAt: now,
        expiresAt,
        createdBy: input.createdBy,
      };

      const result = await collection.insertOne(document);

      if (!result.insertedId) {
        throw new DatabaseValidationError('Failed to create API key');
      }

      const created = await collection.findOne({ _id: result.insertedId });
      if (!created) {
        throw new DatabaseValidationError('Failed to retrieve created API key');
      }

      logger.info(
        { keyId: created._id?.toString(), name: input.name, expiresAt },
        'API key created'
      );

      return {
        document: created,
        plaintextKey, // Return plaintext key only once
      };
    }, 'ApiKey.create');
  }

  /**
   * Validate an API key
   * 
   * @param providedKey - The API key provided by the client
   * @returns The API key document if valid, null otherwise
   */
  static async validate(providedKey: string): Promise<ApiKeyDocument | null> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<ApiKeyDocument>(COLLECTION_NAME);

      // Hash the provided key
      const keyHash = this.hashKey(providedKey);

      // Find the key by hash
      const keyDoc = await collection.findOne({
        keyHash,
        isActive: true,
      });

      if (!keyDoc) {
        return null;
      }

      // Check if key has expired
      const now = new Date();
      if (keyDoc.expiresAt < now) {
        logger.warn(
          { keyId: keyDoc._id?.toString(), name: keyDoc.name, expiresAt: keyDoc.expiresAt },
          'API key validation failed: key expired'
        );
        return null;
      }

      // Update lastUsedAt
      await collection.updateOne(
        { _id: keyDoc._id },
        { $set: { lastUsedAt: now } }
      );

      return keyDoc;
    }, 'ApiKey.validate');
  }

  /**
   * Find API key by ID
   */
  static async findById(keyId: string): Promise<ApiKeyDocument | null> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<ApiKeyDocument>(COLLECTION_NAME);

      try {
        const objectId = new ObjectId(keyId);
        return await collection.findOne({ _id: objectId });
      } catch {
        return null;
      }
    }, 'ApiKey.findById');
  }

  /**
   * List all API keys (for admin purposes)
   */
  static async listAll(): Promise<ApiKeyDocument[]> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<ApiKeyDocument>(COLLECTION_NAME);

      return await collection.find({}).sort({ createdAt: -1 }).toArray();
    }, 'ApiKey.listAll');
  }

  /**
   * Deactivate an API key
   */
  static async deactivate(keyId: string): Promise<void> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<ApiKeyDocument>(COLLECTION_NAME);

      try {
        const objectId = new ObjectId(keyId);
        const result = await collection.updateOne(
          { _id: objectId },
          { $set: { isActive: false } }
        );

        if (result.matchedCount === 0) {
          throw new DatabaseValidationError('API key not found');
        }

        logger.info({ keyId }, 'API key deactivated');
      } catch (error) {
        if (error instanceof DatabaseValidationError) {
          throw error;
        }
        throw new DatabaseValidationError('Failed to deactivate API key');
      }
    }, 'ApiKey.deactivate');
  }

  /**
   * Reactivate an API key
   */
  static async reactivate(keyId: string): Promise<void> {
    await this.ensureIndexes();

    return handleDatabaseOperation(async () => {
      const db = getDB();
      const collection = db.collection<ApiKeyDocument>(COLLECTION_NAME);

      try {
        const objectId = new ObjectId(keyId);
        const result = await collection.updateOne(
          { _id: objectId },
          { $set: { isActive: true } }
        );

        if (result.matchedCount === 0) {
          throw new DatabaseValidationError('API key not found');
        }

        logger.info({ keyId }, 'API key reactivated');
      } catch (error) {
        if (error instanceof DatabaseValidationError) {
          throw error;
        }
        throw new DatabaseValidationError('Failed to reactivate API key');
      }
    }, 'ApiKey.reactivate');
  }
}
