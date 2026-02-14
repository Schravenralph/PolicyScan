/**
 * Field Encryption Service
 * 
 * Provides transparent encryption/decryption for sensitive database fields.
 * Uses AES-256-GCM for authenticated encryption.
 * 
 * Features:
 * - Transparent encryption/decryption
 * - Key rotation support
 * - Performance optimized
 * - Secure key management
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
import { getEnv } from '../../config/env.js';

const scryptAsync = promisify(scrypt);

/**
 * Field Encryption Service
 * 
 * Encrypts sensitive fields before storing in database and decrypts when reading.
 * Uses AES-256-GCM for authenticated encryption with automatic IV generation.
 */
export class FieldEncryptionService {
  private encryptionKey: Buffer | null = null;
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly saltLength = 32; // 256 bits
  private readonly tagLength = 16; // 128 bits

  constructor() {
    this.initializeKey();
  }

  /**
   * Initialize encryption key from environment variable
   * Falls back to a derived key from JWT_SECRET if ENCRYPTION_KEY not set
   */
  private async initializeKey(): Promise<void> {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    const jwtSecret = getEnv().JWT_SECRET;

    if (encryptionKey) {
      // Use provided encryption key (should be 32 bytes/256 bits)
      // If shorter, derive using scrypt
      if (encryptionKey.length >= 32) {
        this.encryptionKey = Buffer.from(encryptionKey.substring(0, 32), 'utf8');
      } else {
        // Derive 32-byte key from provided key
        const salt = Buffer.from('field-encryption-salt', 'utf8');
        this.encryptionKey = (await scryptAsync(encryptionKey, salt, this.keyLength)) as Buffer;
      }
    } else {
      // Derive key from JWT_SECRET (fallback, not recommended for production)
      logger.warn('ENCRYPTION_KEY not set, deriving from JWT_SECRET (not recommended for production)');
      const salt = Buffer.from('field-encryption-salt', 'utf8');
      this.encryptionKey = (await scryptAsync(jwtSecret, salt, this.keyLength)) as Buffer;
    }
  }

  /**
   * Encrypt a field value
   * 
   * @param plaintext - Plaintext value to encrypt
   * @returns Encrypted value (base64 encoded: iv:salt:tag:ciphertext)
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) {
      return plaintext; // Don't encrypt empty strings
    }

    if (!this.encryptionKey) {
      await this.initializeKey();
    }

    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      // Generate random IV and salt for each encryption
      const iv = randomBytes(this.ivLength);
      const salt = randomBytes(this.saltLength);

      // Derive key from master key and salt
      const derivedKey = (await scryptAsync(this.encryptionKey, salt, this.keyLength)) as Buffer;

      // Create cipher
      const cipher = createCipheriv(this.algorithm, derivedKey, iv);
      
      // Encrypt
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine: iv:salt:tag:ciphertext (all base64 encoded)
      const result = Buffer.concat([iv, salt, tag, encrypted]);
      return result.toString('base64');
    } catch (error) {
      logger.error({ error }, 'Field encryption failed');
      throw new Error('Failed to encrypt field');
    }
  }

  /**
   * Decrypt a field value
   * 
   * @param ciphertext - Encrypted value (base64 encoded: iv:salt:tag:ciphertext)
   * @returns Decrypted plaintext value
   */
  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext) {
      return ciphertext; // Don't decrypt empty strings
    }

    if (!this.encryptionKey) {
      await this.initializeKey();
    }

    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      // Decode from base64
      const encryptedBuffer = Buffer.from(ciphertext, 'base64');

      // Extract components
      const iv = encryptedBuffer.subarray(0, this.ivLength);
      const salt = encryptedBuffer.subarray(this.ivLength, this.ivLength + this.saltLength);
      const tag = encryptedBuffer.subarray(
        this.ivLength + this.saltLength,
        this.ivLength + this.saltLength + this.tagLength
      );
      const encrypted = encryptedBuffer.subarray(this.ivLength + this.saltLength + this.tagLength);

      // Derive key from master key and salt
      const derivedKey = (await scryptAsync(this.encryptionKey, salt, this.keyLength)) as Buffer;

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, derivedKey, iv);
      decipher.setAuthTag(tag);

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      logger.error({ error }, 'Field decryption failed');
      throw new Error('Failed to decrypt field - data may be corrupted or key may be incorrect');
    }
  }

  /**
   * Encrypt a field value deterministically (same input = same output)
   * 
   * WARNING: Deterministic encryption is less secure than random encryption
   * but allows querying by encrypted value. Use only when querying is required.
   * 
   * @param plaintext - Plaintext value to encrypt
   * @returns Encrypted value (base64 encoded)
   */
  async encryptDeterministic(plaintext: string): Promise<string> {
    if (!plaintext) {
      return plaintext;
    }

    if (!this.encryptionKey) {
      await this.initializeKey();
    }

    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      // Use sha256(plaintext) as salt for deterministic encryption
      // This ensures same input always produces same output
      // Hash plaintext to get a fixed 32-byte salt that uniquely represents the input
      const salt = createHash('sha256').update(plaintext, 'utf8').digest();
      
      // Derive key from master key and plaintext-based salt
      const derivedKey = (await scryptAsync(this.encryptionKey, salt, this.keyLength)) as Buffer;

      // Use first 16 bytes of derived key as IV for deterministic encryption
      const iv = derivedKey.subarray(0, this.ivLength);

      // Create cipher
      const cipher = createCipheriv(this.algorithm, derivedKey, iv);
      
      // Encrypt
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine: salt:tag:ciphertext (all base64 encoded)
      // Note: No IV needed since it's derived from plaintext
      const result = Buffer.concat([salt, tag, encrypted]);
      return result.toString('base64');
    } catch (error) {
      logger.error({ error }, 'Deterministic field encryption failed');
      throw new Error('Failed to encrypt field deterministically');
    }
  }

  /**
   * Decrypt a deterministically encrypted field value
   * 
   * @param ciphertext - Encrypted value (base64 encoded: salt:tag:ciphertext)
   * @returns Decrypted plaintext value
   */
  async decryptDeterministic(ciphertext: string): Promise<string> {
    if (!ciphertext) {
      return ciphertext;
    }

    if (!this.encryptionKey) {
      await this.initializeKey();
    }

    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      // Decode from base64
      const encryptedBuffer = Buffer.from(ciphertext, 'base64');

      // Extract components (salt is always 32 bytes, zero-padded)
      const salt = encryptedBuffer.subarray(0, 32);
      const tag = encryptedBuffer.subarray(32, 32 + this.tagLength);
      const encrypted = encryptedBuffer.subarray(32 + this.tagLength);

      // Derive key from master key and salt
      const derivedKey = (await scryptAsync(this.encryptionKey, salt, this.keyLength)) as Buffer;

      // Use first 16 bytes of derived key as IV
      const iv = derivedKey.subarray(0, this.ivLength);

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, derivedKey, iv);
      decipher.setAuthTag(tag);

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      logger.error({ error }, 'Deterministic field decryption failed');
      throw new Error('Failed to decrypt field - data may be corrupted or key may be incorrect');
    }
  }

  /**
   * Check if a value is encrypted (heuristic check)
   * 
   * @param value - Value to check
   * @returns true if value appears to be encrypted
   */
  isEncrypted(value: string): boolean {
    if (!value) {
      return false;
    }

    try {
      // Encrypted values are base64 encoded and have a specific length
      const decoded = Buffer.from(value, 'base64');
      // Encrypted format: iv (16) + salt (32) + tag (16) + ciphertext = minimum 64 bytes
      // Deterministic format: salt (32) + tag (16) + ciphertext = minimum 48 bytes
      return decoded.length >= 48;
    } catch {
      return false;
    }
  }

  /**
   * Encrypt multiple fields in an object
   * 
   * @param obj - Object containing fields to encrypt
   * @param fields - Array of field names to encrypt
   * @returns Object with encrypted fields
   */
  async encryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: (keyof T)[]
  ): Promise<T> {
    const result = { ...obj };
    
    for (const field of fields) {
      const value = obj[field];
      if (value && typeof value === 'string') {
        result[field] = await this.encrypt(value) as T[keyof T];
      }
    }
    
    return result;
  }

  /**
   * Decrypt multiple fields in an object
   * 
   * @param obj - Object containing fields to decrypt
   * @param fields - Array of field names to decrypt
   * @returns Object with decrypted fields
   */
  async decryptFields<T extends Record<string, unknown>>(
    obj: T,
    fields: (keyof T)[]
  ): Promise<T> {
    const result = { ...obj };
    
    for (const field of fields) {
      const value = obj[field];
      if (value && typeof value === 'string' && this.isEncrypted(value)) {
        try {
          result[field] = await this.decrypt(value) as T[keyof T];
        } catch (error) {
          logger.warn({ field, error }, 'Failed to decrypt field, keeping encrypted value');
          // Keep encrypted value if decryption fails
        }
    }
    }
    
    return result;
  }
}

// Singleton instance
let fieldEncryptionServiceInstance: FieldEncryptionService | null = null;

/**
 * Get the singleton FieldEncryptionService instance
 */
export function getFieldEncryptionService(): FieldEncryptionService {
  if (!fieldEncryptionServiceInstance) {
    fieldEncryptionServiceInstance = new FieldEncryptionService();
  }
  return fieldEncryptionServiceInstance;
}

