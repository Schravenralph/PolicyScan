import { ScrapedDocument, DocumentType } from '../../infrastructure/types.js';
import { DateExtractor } from '../../extraction/DateExtractor.js';
import { DocumentTypeExtractor } from './DocumentTypeExtractor.js';
import { ThemeExtractor } from '../../extraction/ThemeExtractor.js';
import { LLMMetadataExtractor } from './LLMMetadataExtractor.js';
import { Cache } from '../../infrastructure/cache.js';
import * as crypto from 'crypto';

/**
 * Comprehensive metadata extracted from a document
 */
export interface DocumentMetadata {
  documentType: DocumentType | null;
  publicationDate: Date | null;
  themes: string[];
  issuingAuthority: string | null;
  documentStatus: string | null;
  metadataConfidence: number; // 0-1
}

/**
 * Performance metrics for metadata extraction
 */
export interface MetadataExtractionMetrics {
  totalExtractions: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  averageExtractionTime: number;
  structuredExtractionTime: number;
  llmExtractionTime: number;
}

/**
 * Service for extracting structured metadata from documents
 * 
 * Uses multiple extraction methods:
 * - Pattern matching (dates, types, themes)
 * - LLM-based extraction (for unstructured documents)
 * - Hybrid approach (combines both)
 * 
 * Optimized with caching, batch processing, and performance monitoring
 */
export class MetadataExtractionService {
  private dateExtractor: DateExtractor;
  private typeExtractor: DocumentTypeExtractor;
  private themeExtractor: ThemeExtractor;
  private llmExtractor: LLMMetadataExtractor;
  private readonly enabled: boolean;
  private readonly method: 'structured' | 'llm' | 'hybrid';
  // Cache for extracted metadata
  private cache: Cache<DocumentMetadata>;
  private readonly cacheEnabled: boolean;
  // Performance metrics
  private totalExtractions: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private totalExtractionTime: number = 0;
  private structuredExtractionTime: number = 0;
  private llmExtractionTime: number = 0;

  constructor() {
    this.enabled = process.env.METADATA_EXTRACTION_ENABLED !== 'false';
    this.method = (process.env.METADATA_EXTRACTION_METHOD as 'structured' | 'llm' | 'hybrid') || 'hybrid';
    this.cacheEnabled = process.env.METADATA_EXTRACTION_CACHE_ENABLED !== 'false';
    
    // Initialize cache (default: 1000 entries, 7 days TTL)
    const cacheSize = parseInt(process.env.METADATA_EXTRACTION_CACHE_SIZE || '1000', 10);
    const cacheTTL = parseInt(process.env.METADATA_EXTRACTION_CACHE_TTL || '604800000', 10); // 7 days in ms
    // Validate parsed values
    const validCacheSize = isNaN(cacheSize) || cacheSize <= 0 ? 1000 : cacheSize;
    const validCacheTTL = isNaN(cacheTTL) || cacheTTL <= 0 ? 604800000 : cacheTTL;
    this.cache = new Cache<DocumentMetadata>(validCacheSize, validCacheTTL);
    
    this.dateExtractor = new DateExtractor();
    this.typeExtractor = new DocumentTypeExtractor();
    const maxThemes = parseInt(process.env.THEME_MAX_THEMES || '5', 10);
    const validMaxThemes = isNaN(maxThemes) || maxThemes <= 0 ? 5 : maxThemes;
    this.themeExtractor = new ThemeExtractor(validMaxThemes);
    this.llmExtractor = new LLMMetadataExtractor();
  }

  /**
   * Extract metadata from a document
   * Uses caching to avoid redundant extraction
   */
  async extractMetadata(document: ScrapedDocument): Promise<DocumentMetadata> {
    if (!this.enabled) {
      return this.getDefaultMetadata();
    }

    const startTime = Date.now();
    this.totalExtractions++;

    // Check cache first
    if (this.cacheEnabled) {
      const cacheKey = this.getCacheKey(document);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.cacheHits++;
        this.totalExtractionTime += Date.now() - startTime;
        return cached;
      }
      this.cacheMisses++;
    }

    const metadata: DocumentMetadata = {
      documentType: null,
      publicationDate: null,
      themes: [],
      issuingAuthority: null,
      documentStatus: null,
      metadataConfidence: 0
    };

    // Extract using structured methods
    if (this.method === 'structured' || this.method === 'hybrid') {
      const structuredStart = Date.now();
      const structuredMetadata = await this.extractStructured(document);
      this.structuredExtractionTime += Date.now() - structuredStart;
      Object.assign(metadata, structuredMetadata);
    }

    // Extract using LLM if enabled and method allows
    if ((this.method === 'llm' || this.method === 'hybrid') && this.llmExtractor.isEnabled()) {
      const llmStart = Date.now();
      const llmMetadata = await this.llmExtractor.extractMetadata(document);
      this.llmExtractionTime += Date.now() - llmStart;
      
      if (llmMetadata) {
        // Merge LLM results, preferring LLM for fields it extracted
        if (llmMetadata.documentType && !metadata.documentType) {
          metadata.documentType = llmMetadata.documentType;
        }
        if (llmMetadata.publicationDate && !metadata.publicationDate) {
          const parsedDate = new Date(llmMetadata.publicationDate);
          // Validate date is valid before assigning
          if (!isNaN(parsedDate.getTime())) {
            metadata.publicationDate = parsedDate;
          }
        }
        if (llmMetadata.themes.length > 0 && metadata.themes.length === 0) {
          metadata.themes = llmMetadata.themes;
        }
        if (llmMetadata.issuingAuthority && !metadata.issuingAuthority) {
          metadata.issuingAuthority = llmMetadata.issuingAuthority;
        }
        if (llmMetadata.documentStatus && !metadata.documentStatus) {
          metadata.documentStatus = llmMetadata.documentStatus;
        }
        
        // Update confidence (use LLM confidence if higher)
        metadata.metadataConfidence = Math.max(metadata.metadataConfidence, llmMetadata.confidence);
      }
    }

    // Calculate overall confidence
    if (metadata.metadataConfidence === 0) {
      metadata.metadataConfidence = this.calculateConfidence(metadata);
    }

    // Cache result
    if (this.cacheEnabled) {
      const cacheKey = this.getCacheKey(document);
      await this.cache.set(cacheKey, metadata);
    }

    this.totalExtractionTime += Date.now() - startTime;
    return metadata;
  }

  /**
   * Extract metadata for multiple documents in batch
   * Processes in parallel for better throughput
   */
  async extractMetadataBatch(
    documents: ScrapedDocument[],
    options?: { maxConcurrency?: number }
  ): Promise<DocumentMetadata[]> {
    if (!this.enabled || documents.length === 0) {
      return documents.map(() => this.getDefaultMetadata());
    }

    const parsedConcurrency = parseInt(
      process.env.METADATA_EXTRACTION_BATCH_CONCURRENCY || '10',
      10
    );
    const maxConcurrency = options?.maxConcurrency || (isNaN(parsedConcurrency) || parsedConcurrency <= 0 ? 10 : parsedConcurrency);

    // Process in batches to control concurrency
    const results: DocumentMetadata[] = [];
    for (let i = 0; i < documents.length; i += maxConcurrency) {
      const batch = documents.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(
        batch.map(doc => this.extractMetadata(doc))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get cache key for document
   * Uses hash of URL and title for efficient caching
   */
  private getCacheKey(document: ScrapedDocument): string {
    // Defensive check for required fields
    const url = document.url || '';
    const titel = document.titel || '';
    const key = `${url}:${titel}`;
    // Use SHA-256 hash for consistent cache keys
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return `meta_extract:${hash}`;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): MetadataExtractionMetrics {
    const total = this.cacheHits + this.cacheMisses;
    return {
      totalExtractions: this.totalExtractions,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: total > 0 ? this.cacheHits / total : 0,
      averageExtractionTime: this.totalExtractions > 0
        ? this.totalExtractionTime / this.totalExtractions
        : 0,
      structuredExtractionTime: this.structuredExtractionTime,
      llmExtractionTime: this.llmExtractionTime
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.totalExtractions = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalExtractionTime = 0;
    this.structuredExtractionTime = 0;
    this.llmExtractionTime = 0;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Extract metadata using structured methods (pattern matching)
   */
  private async extractStructured(document: ScrapedDocument): Promise<Partial<DocumentMetadata>> {
    const metadata: Partial<DocumentMetadata> = {};

    // Extract date
    const dateInfo = this.dateExtractor.extractDate(document);
    if (dateInfo) {
      metadata.publicationDate = dateInfo.date;
      metadata.metadataConfidence = dateInfo.confidence;
    }

    // Extract document type
    const docType = this.typeExtractor.extractType(document);
    if (docType) {
      metadata.documentType = docType;
    }

    // Extract themes
    const themes = await this.themeExtractor.extractThemes(document);
    if (themes.length > 0) {
      metadata.themes = themes;
    }

    // Extract issuing authority from website title or URL
    if (document.website_titel && document.url) {
      metadata.issuingAuthority = this.extractAuthority(document.website_titel, document.url);
    }

    return metadata;
  }

  /**
   * Extract issuing authority from website title or URL
   */
  private extractAuthority(websiteTitle: string, url: string): string | null {
    // Common patterns for Dutch government websites
    const titleLower = websiteTitle.toLowerCase();
    const urlLower = url.toLowerCase();

    // Municipality
    if (titleLower.includes('gemeente') || urlLower.includes('gemeente')) {
      const match = websiteTitle.match(/Gemeente\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (match) {
        return match[0];
      }
      return 'Gemeente';
    }

    // Province
    if (titleLower.includes('provincie') || urlLower.includes('provincie')) {
      const match = websiteTitle.match(/Provincie\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (match) {
        return match[0];
      }
      return 'Provincie';
    }

    // National
    if (titleLower.includes('rijksoverheid') || urlLower.includes('rijksoverheid')) {
      return 'Rijksoverheid';
    }

    return null;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(metadata: DocumentMetadata): number {
    let confidence = 0;
    let factors = 0;

    if (metadata.documentType) {
      confidence += 0.3;
      factors++;
    }
    if (metadata.publicationDate) {
      confidence += 0.3;
      factors++;
    }
    if (metadata.themes.length > 0) {
      confidence += 0.2;
      factors++;
    }
    if (metadata.issuingAuthority) {
      confidence += 0.2;
      factors++;
    }

    // Cap confidence at 1.0 (all factors present = 1.0, some factors = partial confidence)
    return factors > 0 ? Math.min(1, confidence) : 0.5;
  }

  /**
   * Get default metadata (when extraction is disabled)
   */
  private getDefaultMetadata(): DocumentMetadata {
    return {
      documentType: null,
      publicationDate: null,
      themes: [],
      issuingAuthority: null,
      documentStatus: null,
      metadataConfidence: 0
    };
  }
}

