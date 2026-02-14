/**
 * KoopSruClient - Client for KOOP SRU 2.0 API
 * 
 * Handles discovery via SRU Search/Retrieve protocol for Wetgeving documents.
 * Supports BWB and CVDR collections.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/09-wetgeving-adapter.md
 */

import axios, { AxiosInstance } from 'axios';
import { parseStringPromise } from 'xml2js';
import { RateLimiter } from '../adapters/dso/RateLimiter.js';
import { logger } from '../utils/logger.js';
import { validateEnv } from '../config/env.js';

/**
 * SRU explain response (capabilities)
 */
export interface SruExplainResponse {
  serverInfo?: Record<string, unknown>;
  databaseInfo?: Record<string, unknown>;
  indexInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * SRU search result record
 */
export interface SruRecord {
  recordIdentifier?: string;
  recordData?: unknown; // XML/JSON record data
  recordPosition?: number;
  [key: string]: unknown;
}

/**
 * SRU search response
 */
export interface SruSearchResponse {
  numberOfRecords?: number;
  nextRecordPosition?: number;
  records?: SruRecord[];
  diagnostics?: Array<{ message: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * KOOP SRU client configuration
 */
export interface KoopSruClientConfig {
  baseUrl?: string;
  connectionBwb?: string;
  connectionCvdr?: string;
  maxRecords?: number;
  rateLimitQps?: number;
}

/**
 * KoopSruClient - Client for KOOP SRU 2.0 API
 */
export class KoopSruClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private config: Required<Pick<KoopSruClientConfig, 'baseUrl' | 'connectionBwb' | 'connectionCvdr' | 'maxRecords'>>;

  constructor(config: KoopSruClientConfig = {}) {
    validateEnv();
    
    this.config = {
      baseUrl: config.baseUrl || process.env.KOOP_SRU_BASE_URL || 'https://zoekservice.overheid.nl/sru/Search',
      connectionBwb: config.connectionBwb || process.env.KOOP_SRU_CONNECTION_BWB || 'BWB',
      connectionCvdr: config.connectionCvdr || process.env.KOOP_SRU_CONNECTION_CVDR || 'cvdr',
      maxRecords: config.maxRecords || parseInt(process.env.KOOP_SRU_MAX_RECORDS || '50', 10),
    };

    const rateLimitQps = config.rateLimitQps || parseInt(process.env.KOOP_SRU_RATE_LIMIT_QPS || '5', 10);

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/xml, application/json',
      },
    });

    // Rate limiter: configured QPS with capacity equal to QPS
    this.rateLimiter = new RateLimiter(rateLimitQps, rateLimitQps);
  }

  /**
   * Explain operation - verify server capabilities
   * 
   * Should be called once per deployment to verify server capabilities.
   * 
   * @param connection - Collection name (BWB or cvdr)
   * @returns Explain response with server capabilities
   */
  async explain(connection: string = this.config.connectionBwb): Promise<SruExplainResponse> {
    await this.rateLimiter.acquire();

    try {
      const response = await this.client.get('', {
        params: {
          'x-connection': connection,
          operation: 'explain',
          version: '2.0',
        },
        responseType: 'text',
      });

      // Parse XML response
      const parsed = await parseStringPromise(response.data, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
      });

      logger.debug(
        { connection, responseSize: response.data.length },
        'SRU explain operation completed'
      );

      return parsed as SruExplainResponse;
    } catch (error) {
      logger.error({ error, connection }, 'Failed to execute SRU explain operation');
      throw new Error(`SRU explain failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search and retrieve records
   * 
   * @param query - CQL query string
   * @param connection - Collection name (BWB or cvdr)
   * @param startRecord - Starting record position (default: 1)
   * @param maximumRecords - Maximum records to return (default: from config)
   * @returns Search response with records
   */
  async searchRetrieve(
    query: string,
    connection: string = this.config.connectionBwb,
    startRecord: number = 1,
    maximumRecords?: number
  ): Promise<SruSearchResponse> {
    await this.rateLimiter.acquire();

    const maxRecs = maximumRecords || this.config.maxRecords;

    try {
      const response = await this.client.get('', {
        params: {
          'x-connection': connection,
          operation: 'searchRetrieve',
          version: '2.0',
          query,
          maximumRecords: maxRecs,
          startRecord,
        },
        responseType: 'text',
      });

      // Parse XML response
      const parsed = await parseStringPromise(response.data, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
      });

      // Extract search response structure
      // SRU response format: <srw:searchRetrieveResponse> with <srw:records> and <srw:numberOfRecords>
      const searchResponse: SruSearchResponse = {
        numberOfRecords: this.extractNumber(parsed, ['numberOfRecords', 'srw:numberOfRecords']),
        nextRecordPosition: this.extractNumber(parsed, ['nextRecordPosition', 'srw:nextRecordPosition']),
        records: this.extractRecords(parsed),
      };

      logger.debug(
        {
          connection,
          query,
          startRecord,
          numberOfRecords: searchResponse.numberOfRecords,
          recordsReturned: searchResponse.records?.length || 0,
        },
        'SRU searchRetrieve completed'
      );

      return searchResponse;
    } catch (error) {
      logger.error({ error, connection, query }, 'Failed to execute SRU searchRetrieve');
      throw new Error(`SRU searchRetrieve failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract number value from parsed XML
   */
  private extractNumber(obj: unknown, keys: string[]): number | undefined {
    if (typeof obj !== 'object' || obj === null) {
      return undefined;
    }

    for (const key of keys) {
      const value = this.findValue(obj, [key]);
      if (value !== null && value !== undefined) {
        const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);
        if (!isNaN(num)) {
          return num;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract records from parsed SRU response
   */
  private extractRecords(parsed: unknown): SruRecord[] {
    const records: SruRecord[] = [];

    if (typeof parsed !== 'object' || parsed === null) {
      return records;
    }

    // Look for records array in various possible locations
    const recordsData = this.findValue(parsed, ['records', 'srw:records', 'searchRetrieveResponse', 'srw:searchRetrieveResponse']);
    
    if (!recordsData) {
      return records;
    }

    // Handle array of records
    if (Array.isArray(recordsData)) {
      for (const record of recordsData) {
        records.push(this.parseRecord(record));
      }
    } else if (typeof recordsData === 'object' && recordsData !== null) {
      // Single record or nested structure
      const recordsDataObj = recordsData as Record<string, unknown>;
      const recordArray = Array.isArray(recordsDataObj.record) 
        ? recordsDataObj.record 
        : recordsDataObj.records 
        ? (Array.isArray(recordsDataObj.records) ? recordsDataObj.records : [recordsDataObj.records])
        : [recordsData];
      
      for (const record of recordArray) {
        records.push(this.parseRecord(record));
      }
    }

    return records;
  }

  /**
   * Parse a single SRU record
   */
  private parseRecord(record: unknown): SruRecord {
    if (typeof record !== 'object' || record === null) {
      return {};
    }

    const recordObj = record as Record<string, unknown>;

    return {
      recordIdentifier: this.findValue(recordObj, ['recordIdentifier', 'srw:recordIdentifier']) as string | undefined,
      recordPosition: this.extractNumber(recordObj, ['recordPosition', 'srw:recordPosition']),
      recordData: this.findValue(recordObj, ['recordData', 'srw:recordData', 'record', 'srw:record']),
    };
  }

  /**
   * Find value by key (case-insensitive, supports namespaces)
   */
  private findValue(obj: unknown, keys: string[]): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    for (const key of keys) {
      // Direct match
      if (key in obj) {
        const value = (obj as Record<string, unknown>)[key];
        if (value !== null && value !== undefined) {
          return value;
        }
      }

      // Case-insensitive and namespace-agnostic match
      for (const [objKey, value] of Object.entries(obj)) {
        const normalizedKey = objKey.replace(/[:\\]/g, '').toLowerCase();
        const normalizedSearch = key.replace(/[:\\]/g, '').toLowerCase();
        if (normalizedKey === normalizedSearch) {
          if (value !== null && value !== undefined) {
            return value;
          }
        }
      }
    }

    // Recursive search in nested objects
    for (const value of Object.values(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const found = this.findValue(value, keys);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
}

