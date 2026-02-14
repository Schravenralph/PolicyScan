import crypto from 'crypto';
import { logger } from '../../../utils/logger.js';

/**
 * Service for hashing content to detect changes
 */
export class ContentHasher {
  /**
   * Generate hash for content using specified algorithm
   * @param content Content to hash
   * @param algorithm Hash algorithm (default: sha256)
   * @returns Hex-encoded hash string
   */
  static hash(content: string, algorithm: 'sha256' | 'md5' = 'sha256'): string {
    try {
      const hash = crypto.createHash(algorithm);
      hash.update(content, 'utf8');
      return hash.digest('hex');
    } catch (error) {
      logger.error({ error }, '[ContentHasher] Failed to hash content');
      throw new Error(`Failed to hash content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate hash for document content (title + summary + body)
   * @param document Document to hash
   * @param algorithm Hash algorithm (default: sha256)
   * @returns Hex-encoded hash string
   */
  static hashDocument(document: {
    titel?: string;
    samenvatting?: string;
    content?: string;
    url?: string;
  }, algorithm: 'sha256' | 'md5' = 'sha256'): string {
    const content = [
      document.titel || '',
      document.samenvatting || '',
      document.content || '',
      document.url || ''
    ].join('\n');
    
    return this.hash(content, algorithm);
  }

  /**
   * Generate hash for entity content
   * @param entity Entity to hash
   * @param algorithm Hash algorithm (default: sha256)
   * @returns Hex-encoded hash string
   */
  static hashEntity(entity: {
    id?: string;
    type?: string;
    name?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }, algorithm: 'sha256' | 'md5' = 'sha256'): string {
    const content = [
      entity.id || '',
      entity.type || '',
      entity.name || '',
      entity.description || '',
      JSON.stringify(entity.metadata || {})
    ].join('\n');
    
    return this.hash(content, algorithm);
  }

  /**
   * Compare two hashes
   * @param hash1 First hash
   * @param hash2 Second hash
   * @returns true if hashes are equal
   */
  static compare(hash1: string, hash2: string): boolean {
    return hash1 === hash2;
  }
}

