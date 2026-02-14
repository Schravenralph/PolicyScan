/**
 * CDX File Processor
 * 
 * Processes Common Crawl CDX files (CDXJ format) with stream parsing
 * and batch insertion into MongoDB.
 */

import * as fs from 'fs';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import * as readline from 'readline';
import { logger } from '../../utils/logger.js';
import { CommonCrawlIndexService } from './CommonCrawlIndexService.js';
import type { CDXIndexRecord } from './CommonCrawlIndexService.js';

export interface CDXRecord {
  url?: string;
  'mime'?: string;
  'mime-detected'?: string;
  status?: string;
  digest?: string;
  length?: string | number;
  offset?: string;
  filename?: string;
  timestamp?: string;
  urlkey?: string;
}

export interface ProcessResult {
  filePath: string;
  recordsProcessed: number;
  recordsInserted: number;
  recordsFiltered: number;
  errors: number;
  duration: number;
  processingSpeed?: number; // records/second
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

export interface ProcessOptions {
  filePath: string;
  crawlId: string;
  batchSize?: number;
  filter?: (record: CDXRecord) => boolean;
  onProgress?: (processed: number, inserted: number) => void;
}

/**
 * Service for processing CDX files
 */
export class CDXFileProcessor {
  private readonly indexService: CommonCrawlIndexService;
  private readonly defaultBatchSize = 1000;

  constructor(indexService: CommonCrawlIndexService) {
    this.indexService = indexService;
  }

  /**
   * Process a single CDX file
   */
  async processFile(options: ProcessOptions): Promise<ProcessResult> {
    const {
      filePath,
      crawlId,
      batchSize = this.defaultBatchSize,
      filter,
      onProgress,
    } = options;

    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsInserted = 0;
    let recordsFiltered = 0;
    let errors = 0;
    let status: 'success' | 'partial' | 'failed' = 'success';
    let error: string | undefined;

    logger.info({ filePath, crawlId, batchSize }, 'Starting CDX file processing');

    try {
      // Validate file exists
      try {
        await fs.promises.access(filePath);
      } catch {
        throw new Error(`File not found: ${filePath}`);
      }

      // Process file with streaming
      const batch: Omit<CDXIndexRecord, '_id' | 'createdAt'>[] = [];

      await this.processFileStream(filePath, crawlId, (record) => {
        recordsProcessed++;

        // Apply filter if provided
        if (filter && !filter(record)) {
          recordsFiltered++;
          return;
        }

        // Convert CDX record to index record
        try {
          const indexRecord = this.convertCDXToRecord(record, crawlId);
          batch.push(indexRecord);

          // Insert batch when it reaches batch size
          if (batch.length >= batchSize) {
            this.insertBatch(batch).then((inserted) => {
              recordsInserted += inserted;
              if (onProgress) {
                onProgress(recordsProcessed, recordsInserted);
              }
            });
            batch.length = 0; // Clear batch
          }
        } catch (err) {
          errors++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.debug({ error: errorMessage, record }, 'Failed to convert record');
        }
      });

      // Insert remaining batch
      if (batch.length > 0) {
        const inserted = await this.insertBatch(batch);
        recordsInserted += inserted;
      }

      const duration = Date.now() - startTime;
      status = errors > 0 ? 'partial' : 'success';
      // Calculate processing speed (records/second)
      const processingSpeed = duration > 0 ? recordsProcessed / (duration / 1000) : 0;

      logger.info(
        {
          filePath,
          recordsProcessed,
          recordsInserted,
          recordsFiltered,
          errors,
          duration,
          processingSpeed,
        },
        'CDX file processing completed'
      );

      return {
        filePath,
        recordsProcessed,
        recordsInserted,
        recordsFiltered,
        errors,
        duration,
        processingSpeed,
        status,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      error = err instanceof Error ? err.message : String(err);
      status = 'failed';

      logger.error({ filePath, error, duration }, 'CDX file processing failed');

      return {
        filePath,
        recordsProcessed,
        recordsInserted,
        recordsFiltered,
        errors,
        duration,
        processingSpeed: 0,
        status,
        error,
      };
    }
  }

  /**
   * Process multiple files in parallel
   */
  async processFiles(
    filePaths: string[],
    crawlId: string,
    options?: {
      concurrency?: number;
      batchSize?: number;
      filter?: (record: CDXRecord) => boolean;
      onProgress?: (fileIndex: number, total: number, result: ProcessResult) => void;
    }
  ): Promise<ProcessResult[]> {
    const {
      concurrency = 3, // Process 3 files in parallel
      batchSize = this.defaultBatchSize,
      filter,
      onProgress,
    } = options || {};

    logger.info(
      { fileCount: filePaths.length, concurrency, crawlId },
      'Starting parallel CDX file processing'
    );

    const results: ProcessResult[] = [];
    const processQueue: Array<Promise<void>> = [];
    let fileIndex = 0;

    const processNext = async (): Promise<void> => {
      while (fileIndex < filePaths.length) {
        const currentIndex = fileIndex++;
        const filePath = filePaths[currentIndex];

        try {
          const result = await this.processFile({
            filePath,
            crawlId,
            batchSize,
            filter,
          });
          results[currentIndex] = result;
          if (onProgress) {
            onProgress(currentIndex, filePaths.length, result);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results[currentIndex] = {
            filePath,
            recordsProcessed: 0,
            recordsInserted: 0,
            recordsFiltered: 0,
            errors: 1,
            duration: 0,
            processingSpeed: 0,
            status: 'failed',
            error: errorMessage,
          };
          if (onProgress) {
            onProgress(currentIndex, filePaths.length, results[currentIndex]);
          }
        }
      }
    };

    // Start concurrent processing
    for (let i = 0; i < concurrency; i++) {
      processQueue.push(processNext());
    }

    await Promise.all(processQueue);

    logger.info(
      {
        totalFiles: filePaths.length,
        successful: results.filter(r => r.status === 'success').length,
        partial: results.filter(r => r.status === 'partial').length,
        failed: results.filter(r => r.status === 'failed').length,
      },
      'Parallel CDX file processing completed'
    );

    return results;
  }

  /**
   * Process file with streaming (memory-efficient)
   */
  private async processFileStream(
    filePath: string,
    _crawlId: string,
    onRecord: (record: CDXRecord) => void
  ): Promise<void> {
    const readStream = createReadStream(filePath);
    const gunzip = createGunzip();

    // Create readline interface directly from gunzip stream
    // This avoids manual buffer management and string concatenation
    const rl = readline.createInterface({
      input: readStream.pipe(gunzip),
      crlfDelay: Infinity
    });

    return new Promise((resolve, reject) => {
      // Handle stream errors
      readStream.on('error', (err) => {
        rl.removeAllListeners('close');
        rl.close();
        reject(err);
      });
      gunzip.on('error', (err) => {
        rl.removeAllListeners('close');
        rl.close();
        reject(err);
      });

      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            // CDXJ format: urlkey timestamp {json object}
            // Find the last space before the JSON object
            const lastSpaceIndex = trimmed.lastIndexOf(' ');
            if (lastSpaceIndex === -1) {
              // Try parsing as pure JSON (fallback)
              const record = JSON.parse(trimmed) as CDXRecord;
              onRecord(record);
            } else {
              // Extract urlkey, timestamp, and JSON object
              const beforeJson = trimmed.substring(0, lastSpaceIndex).trim();
              const jsonPart = trimmed.substring(lastSpaceIndex + 1).trim();

              // Split urlkey and timestamp (they're space-separated)
              const parts = beforeJson.split(/\s+/);
              const urlkey = parts[0] || '';
              const timestamp = parts[1] || '';

              // Parse the JSON object
              const jsonRecord = JSON.parse(jsonPart) as CDXRecord;

              // Merge urlkey and timestamp into the record if not present
              const record: CDXRecord = {
                ...jsonRecord,
                urlkey: jsonRecord.urlkey || urlkey,
                timestamp: jsonRecord.timestamp || timestamp,
              };

              onRecord(record);
            }
          } catch (err) {
            // Skip invalid lines
            logger.debug({ line: trimmed.substring(0, 100), error: err }, 'Failed to parse CDX line');
          }
        }
      });

      rl.on('close', () => {
        resolve();
      });

      // Some versions of readline emit error, though uncommon
      rl.on('error', (err) => {
        rl.removeAllListeners('close');
        rl.close();
        reject(err);
      });
    });
  }

  /**
   * Insert batch of records into MongoDB
   */
  private async insertBatch(
    records: Omit<CDXIndexRecord, '_id' | 'createdAt'>[]
  ): Promise<number> {
    if (records.length === 0) return 0;
    return await this.indexService.insertRecords(records);
  }

  /**
   * Convert CDX record to index record
   */
  private convertCDXToRecord(
    cdxRecord: CDXRecord,
    crawlId: string
  ): Omit<CDXIndexRecord, '_id' | 'createdAt'> {
    const url = cdxRecord.url || '';
    const lengthValue = Number(cdxRecord.length ?? 0);

    // Extract domain and path from URL
    const domain = this.extractDomain(url);
    const path = this.extractPath(url);

    return {
      urlkey: cdxRecord.urlkey || '',
      timestamp: cdxRecord.timestamp || '',
      url,
      mime: cdxRecord.mime || cdxRecord['mime-detected'] || 'unknown',
      status: cdxRecord.status || 'unknown',
      digest: cdxRecord.digest || '',
      length: Number.isFinite(lengthValue) ? lengthValue : 0,
      offset: cdxRecord.offset || '',
      filename: cdxRecord.filename || '',
      domain,
      path,
      crawlId,
      source: 'cdx-file', // Mark as from CDX file
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return '';
    }
  }

  /**
   * Extract path from URL
   */
  private extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return '';
    }
  }
}

