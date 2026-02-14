/**
 * UnifiedChunkingService - Unified chunking service with strategy registry
 * 
 * Provides deterministic chunking for all document families with family-specific strategies.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/04-unified-chunking.md
 */

import type { CanonicalDocument, CanonicalChunkDraft, DocumentFamily } from '../contracts/types.js';
import { normalizeTextForFingerprint, generateChunkId, computeChunkFingerprint } from '../utils/fingerprints.js';
import { logger } from '../utils/logger.js';
import { BadRequestError } from '../types/errors.js';
import { DefaultChunkingStrategy } from './strategies/DefaultChunkingStrategy.js';
import { StopTpodChunkingStrategy } from './strategies/StopTpodChunkingStrategy.js';
import { JuridischChunkingStrategy } from './strategies/JuridischChunkingStrategy.js';
import { BeleidChunkingStrategy } from './strategies/BeleidChunkingStrategy.js';
import type { ChunkingStrategy } from './strategies/ChunkingStrategy.js';
import { getProcessingStrategy } from '../types/document-type-registry.js';

/**
 * Chunking configuration
 */
export interface ChunkingConfig {
  chunkingVersion: string; // e.g., "v1"
  minChunkSize?: number; // Minimum chunk size in characters (default: ~400 tokens ≈ 1600 chars)
  maxChunkSize?: number; // Maximum chunk size in characters (default: ~1200 tokens ≈ 4800 chars)
  chunkOverlap?: number; // Overlap in characters (default: ~50 tokens ≈ 200 chars)
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: CanonicalChunkDraft[];
  normalizedText: string; // Normalized fullText used for chunking
}

/**
 * UnifiedChunkingService - Main chunking service with strategy registry
 */
export class UnifiedChunkingService {
  private strategies: Map<string, ChunkingStrategy> = new Map();
  private defaultStrategy: ChunkingStrategy;

  constructor() {
    // Register strategies
    this.defaultStrategy = new DefaultChunkingStrategy();
    this.strategies.set('default', this.defaultStrategy);
    this.strategies.set('stop-tpod', new StopTpodChunkingStrategy());
    this.strategies.set('juridisch', new JuridischChunkingStrategy());
    this.strategies.set('beleid', new BeleidChunkingStrategy());
  }

  /**
   * Chunk a canonical document
   * 
   * Selects appropriate strategy based on documentFamily and documentType,
   * then generates deterministic chunks with stable chunkIds and offsets.
   * 
   * @param document - Canonical document to chunk
   * @param config - Chunking configuration
   * @returns Chunking result with chunks and normalized text
   */
  async chunkDocument(
    document: CanonicalDocument,
    config: ChunkingConfig
  ): Promise<ChunkingResult> {
    if (!document.fullText || document.fullText.trim().length === 0) {
      throw new BadRequestError('Document fullText is required and must not be empty', {
        documentId: document._id,
        documentFamily: document.documentFamily,
      });
    }

    // Normalize text (same normalization used for fingerprinting)
    const normalizedText = normalizeTextForFingerprint(document.fullText);

    // Select strategy based on documentFamily and documentType
    const strategy = this.selectStrategy(document.documentFamily, document.documentType);

    // Generate chunks using selected strategy
    const chunkSegments = await strategy.chunk(
      normalizedText,
      document,
      {
        minChunkSize: config.minChunkSize ?? 1600, // ~400 tokens
        maxChunkSize: config.maxChunkSize ?? 4800, // ~1200 tokens
        chunkOverlap: config.chunkOverlap ?? 200, // ~50 tokens
      }
    );

    // Convert segments to CanonicalChunkDraft with deterministic IDs
    const chunks: CanonicalChunkDraft[] = chunkSegments.map((segment, index) => {
      const chunkText = normalizedText.substring(segment.start, segment.end);
      const chunkFingerprint = computeChunkFingerprint(chunkText);
      // Use document._id (MongoDB ObjectId as string) for chunkId generation
      const chunkId = generateChunkId(
        document._id,
        config.chunkingVersion,
        index,
        chunkText
      );

      return {
        chunkId,
        documentId: document._id,
        chunkIndex: index,
        text: chunkText,
        offsets: {
          start: segment.start,
          end: segment.end,
        },
        headingPath: segment.headingPath,
        legalRefs: segment.legalRefs,
        chunkFingerprint,
      };
    });

    logger.debug(
      {
        documentId: document._id,
        documentFamily: document.documentFamily,
        documentType: document.documentType,
        strategy: strategy.getName(),
        chunkCount: chunks.length,
        chunkingVersion: config.chunkingVersion,
      },
      'Chunked document'
    );

    return {
      chunks,
      normalizedText,
    };
  }

  /**
   * Select chunking strategy based on document family and type
   * 
   * Uses document type registry to determine processing strategy.
   * 
   * @param documentFamily - Document family
   * @param documentType - Document type
   * @returns Selected chunking strategy
   */
  private selectStrategy(
    documentFamily: DocumentFamily,
    documentType: string
  ): ChunkingStrategy {
    // Use document type registry to get processing strategy
    const processingStrategy = getProcessingStrategy(documentFamily, documentType);
    
    // Map processing strategy to chunking strategy key
    const strategyMap: Record<string, string> = {
      'dso-structured': 'stop-tpod',
      'legal-structured': 'juridisch',
      'policy-generic': 'beleid',
      'web-content': 'default',
      'geo-metadata': 'default',
      'informational-generic': 'default',
    };

    const strategyKey = strategyMap[processingStrategy] || 'default';
    const strategy = this.strategies.get(strategyKey);

    if (strategy) {
      logger.debug(
        { documentFamily, documentType, processingStrategy, strategyKey },
        'Selected chunking strategy from registry'
      );
      return strategy;
    }

    // Fallback to default strategy
    logger.debug(
      { documentFamily, documentType, processingStrategy, strategyKey },
      'Using default chunking strategy (strategy not found)'
    );
    return this.defaultStrategy;
  }

  /**
   * Register a custom chunking strategy
   * 
   * @param key - Strategy key
   * @param strategy - Chunking strategy implementation
   */
  registerStrategy(key: string, strategy: ChunkingStrategy): void {
    this.strategies.set(key, strategy);
    logger.debug({ key, strategyName: strategy.getName() }, 'Registered chunking strategy');
  }
}

