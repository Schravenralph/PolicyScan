import * as dotenv from 'dotenv';
import http from 'http';
import https from 'https';
import { Agent, fetch as undiciFetch } from 'undici';
import graphdb from 'graphdb';
import { getEnv } from './env.js';
import {
  connectionPoolSize,
  connectionErrors,
  connectionLatency,
} from '../utils/metrics.js';
import { logger } from '../utils/logger.js';
import { getServiceHostnameStrict } from '../utils/dockerDetection.js';

dotenv.config();

/**
 * GraphDB connection configuration using official graphdb.js driver
 * 
 * GraphDB exposes a SPARQL endpoint at:
 * http://{host}:{port}/repositories/{repository-id}
 * 
 * Default: http://localhost:7200/repositories/beleidsscan
 */
// Validate environment variables
let env: ReturnType<typeof getEnv>;
try {
  env = getEnv();
} catch (error) {
  console.error('Failed to validate environment variables:', error);
  throw error;
}

// Enforced containerization: Must use Docker service name
const host = env.GRAPHDB_HOST || getServiceHostnameStrict('graphdb');

// Enforce Docker service name if localhost is present
if (host === 'localhost' || host === '127.0.0.1') {
  const correctedHost = getServiceHostnameStrict('graphdb');
  logger.warn(`⚠️  GraphDB host was localhost, corrected to Docker service name: ${correctedHost}`);
}
const port = env.GRAPHDB_PORT.toString();
const repository = process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG';
const username = process.env.GRAPHDB_USER || 'admin';
const password = process.env.GRAPHDB_PASSWORD || 'root';

const baseUrl = `http://${host}:${port}`;
const queryEndpoint = `${baseUrl}/repositories/${repository}`;
const updateEndpoint = `${baseUrl}/repositories/${repository}/statements`;
const restEndpoint = `${baseUrl}/rest`;

if (!process.env.GRAPHDB_PASSWORD) {
  console.warn(
    '⚠️  GRAPHDB_PASSWORD not set, using default "root". Set GRAPHDB_PASSWORD in .env for production.'
  );
}

/**
 * HTTP Agent Pooling for GraphDB
 * 
 * Creates HTTP agents with connection pooling to improve performance and connection reuse.
 * Agents are shared across all GraphDBClient instances.
 * 
 * For Node.js 18+, we use undici's Agent which provides modern connection pooling.
 * For compatibility, we also create native HTTP/HTTPS agents.
 * 
 * Configuration:
 * - keepAlive: true - Reuse connections for multiple requests
 * - maxSockets: 50 - Maximum number of sockets per host
 * - maxFreeSockets: 10 - Maximum number of free sockets to keep open
 * 
 * These settings optimize for:
 * - High concurrency (many simultaneous queries)
 * - Connection reuse (reducing TCP handshake overhead)
 * - Resource efficiency (limiting idle connections)
 */

// Native HTTP agents (for compatibility with libraries that require them)
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000, // 60 seconds
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000, // 60 seconds
});

// Undici Agent for modern connection pooling (Node.js 18+)
// Undici has its own connection pooling mechanism that's more efficient
const undiciAgent = new Agent({
  keepAliveTimeout: 60000, // Keep connections alive for 60 seconds
  keepAliveMaxTimeout: 60000, // Maximum time to keep connections alive
  connectTimeout: 10000, // Connection timeout: 10 seconds
  // Note: undici Agent doesn't support maxSockets - it manages connections automatically
});

/**
 * Custom fetch function that uses HTTP agents for connection pooling
 * Uses undici fetch with agent support for Node.js 18+
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options (headers, method, body, etc.)
 * @returns Promise resolving to Response
 */
function fetchWithAgent(
  url: string | URL,
  options?: RequestInit
): Promise<Response> {
  // Use undici fetch with the shared agent for connection pooling
  // Type assertion needed because undici's RequestInit includes dispatcher which isn't in standard RequestInit
  // and undici's Response type differs slightly from standard Response
  const undiciOptions = {
    ...options,
    // Filter out null body (undici doesn't accept null, only undefined)
    body: options?.body === null ? undefined : options?.body,
    dispatcher: undiciAgent,
  } as Parameters<typeof undiciFetch>[1];
  // Cast to standard Response type for compatibility (via unknown as TypeScript suggests)
  return undiciFetch(url, undiciOptions) as unknown as Promise<Response>;
}

let repoClient: graphdb.repository.RDFRepositoryClient | null = null;

// Parser initialization with retry logic
// The parser must be available - we will retry until it loads
type SparqlJsonResultParser = InstanceType<typeof graphdb.parser.SparqlJsonResultParser>;
let _jsonParser: SparqlJsonResultParser | null = null;
let _parserInitializationPromise: Promise<SparqlJsonResultParser> | null = null;
let _parserInitialized = false;
let _parserInitializationError: Error | null = null;

const MAX_PARSER_RETRIES = 10;
const INITIAL_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 5000;

/**
 * Initialize the GraphDB JSON parser with retry logic
 * This ensures the parser is available even if the graphdb module loads asynchronously
 */
async function initializeParser(): Promise<SparqlJsonResultParser> {
  if (_jsonParser) {
    return _jsonParser;
  }

  if (_parserInitializationPromise) {
    return _parserInitializationPromise;
  }

  _parserInitializationPromise = (async () => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < MAX_PARSER_RETRIES; attempt++) {
      try {
        // Check if parser is available
        // Note: graphdb uses default export in ES modules
        const Parser = graphdb?.parser?.SparqlJsonResultParser;
        
        if (Parser && typeof Parser === 'function') {
          _jsonParser = new Parser();
          _parserInitialized = true;
          _parserInitializationError = null;
          console.log('✅ GraphDB parser initialized successfully');
          return _jsonParser;
        } else {
          // Parser not yet available, wait and retry
          const delay = Math.min(
            INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
            MAX_RETRY_DELAY_MS
          );
          
          if (attempt < MAX_PARSER_RETRIES - 1) {
            console.log(
              `⏳ GraphDB parser not yet available (attempt ${attempt + 1}/${MAX_PARSER_RETRIES}), retrying in ${delay}ms...`
            );
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            lastError = new Error(
              'GraphDB parser not available after multiple retries. ' +
              'Expected graphdb.parser.SparqlJsonResultParser to be available. ' +
              'This may indicate an issue with the graphdb package installation or module loading.'
            );
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const delay = Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
          MAX_RETRY_DELAY_MS
        );
        
        if (attempt < MAX_PARSER_RETRIES - 1) {
          console.warn(
            `⚠️  GraphDB parser initialization attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If we get here, all retries failed
    _parserInitializationError = lastError;
    throw lastError || new Error('GraphDB parser initialization failed after all retries');
  })();

  try {
    return await _parserInitializationPromise;
  } catch (error) {
    // Reset promise so we can retry on next call
    _parserInitializationPromise = null;
    throw error;
  }
}

/**
 * Get the GraphDB JSON parser instance
 * Will initialize the parser if not already initialized, with retry logic
 * @throws Error if parser cannot be initialized after all retries
 */
export async function getJsonParser(): Promise<SparqlJsonResultParser> {
  if (_jsonParser) {
    return _jsonParser;
  }
  
  return await initializeParser();
}

/**
 * Synchronous getter for parser (for backward compatibility)
 * Will throw if parser is not yet initialized
 * Use getJsonParser() for async initialization with retries
 */
export function getJsonParserSync(): SparqlJsonResultParser {
  if (!_jsonParser) {
    if (_parserInitializationError) {
      throw _parserInitializationError;
    }
    throw new Error(
      'GraphDB parser not yet initialized. Use getJsonParser() for async initialization, ' +
      'or ensure initializeParser() has been called first.'
    );
  }
  return _jsonParser;
}

/**
 * Check if parser is initialized and ready
 */
export function isParserReady(): boolean {
  return _parserInitialized && _jsonParser !== null;
}

/**
 * Ensure parser is initialized (can be called at startup)
 * This will attempt to initialize the parser immediately
 */
export async function ensureParserInitialized(): Promise<void> {
  try {
    await getJsonParser();
  } catch (error) {
    console.error('❌ Failed to initialize GraphDB parser:', error);
    // Don't throw - allow the system to continue, but log the error
    // The parser will be retried on next use
  }
}

// Export for backward compatibility - lazy initialization with retry
// The parser.parse() method takes (stream, config) where config needs queryType
export const jsonParser = {
  /**
   * Parse SPARQL JSON results from a stream
   * @param stream - The response stream from GraphDB query
   * @param queryType - The SPARQL query type (SELECT, ASK, etc.)
   * @returns Promise resolving to parsed bindings
   */
  parseToBindings: async (
    stream: ReadableStream<Uint8Array> | Response,
    queryType: graphdb.query.QueryType | string = graphdb.query?.QueryType?.SELECT || 'SELECT'
  ): Promise<Record<string, unknown>[]> => {
    const parser = await getJsonParser();
    const config = { queryType };
    return parser.parse(stream, config);
  },
  /**
   * Direct access to the parser instance for advanced usage
   */
  getParser: () => getJsonParser()
};

/**
 * Get GraphDB repository client instance
 * Uses the official graphdb.js driver from Ontotext
 */
export function getRepositoryClient(): graphdb.repository.RDFRepositoryClient {
  if (!repoClient) {
    const config = new graphdb.repository.RepositoryClientConfig(queryEndpoint)
      .setEndpoints([queryEndpoint, updateEndpoint])
      .setDefaultRDFMimeType('application/x-turtle')
      .setHeaders({ Accept: 'application/sparql-results+json' });

    // Add authentication if credentials provided
    if (username && password) {
      config.useBasicAuthentication(username, password);
    }

    repoClient = new graphdb.repository.RDFRepositoryClient(config);
    
    // Inject fetch for Node.js compatibility (if the client supports it)
    // Note: The graphdb.js library should use global fetch if available
    // In Node.js 18+, fetch is built-in. For older versions, cross-fetch provides it.
    if (typeof globalThis.fetch === 'undefined') {
      (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = fetch;
    }
  }
  return repoClient;
}

/**
 * GraphDB client wrapper for executing SPARQL queries and managing RDF data
 * Provides a higher-level API on top of the official graphdb.js driver
 */
export class GraphDBClient {
  private readonly client: graphdb.repository.RDFRepositoryClient;
  private readonly queryEndpoint: string;
  private readonly updateEndpoint: string;
  private readonly restEndpoint: string;
  private healthCheckIntervalId: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;

  // Retry configuration constants
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_REQUEST_TIMEOUT_MS = 30000; // 30 seconds
  private readonly MAX_BACKOFF_DELAY_MS = 10000; // 10 seconds

  constructor(
    client: graphdb.repository.RDFRepositoryClient,
    queryEndpoint: string,
    updateEndpoint: string,
    restEndpoint: string
  ) {
    this.client = client;
    this.queryEndpoint = queryEndpoint;
    this.updateEndpoint = updateEndpoint;
    this.restEndpoint = restEndpoint;
  }

  /**
   * Check if an error should trigger a retry
   * Retries on network errors and 5xx errors, but not on 4xx client errors
   */
  private shouldRetryError(error: unknown, statusCode?: number): boolean {
    // Don't retry on 4xx client errors
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return false;
    }

    // Retry on 5xx server errors
    if (statusCode && statusCode >= 500) {
      return true;
    }

    // Retry on network errors (no status code)
    if (!statusCode) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Check for common network error patterns
      if (
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('network') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('timeout')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate exponential backoff delay
   * Formula: Math.min(1000 * Math.pow(2, attempt), maxDelay)
   */
  private calculateBackoffDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), this.MAX_BACKOFF_DELAY_MS);
  }

  /**
   * Execute a fetch request with timeout using AbortController
   * Uses fetchWithAgent for connection pooling
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchWithAgent(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Execute an operation with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.DEFAULT_MAX_RETRIES
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: unknown;
    let lastStatusCode: number | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await operation();
        const latency = (Date.now() - startTime) / 1000; // Convert to seconds
        
        // Track successful operation latency
        connectionLatency.observe({ type: 'graphdb', operation: operationName }, latency);
        this.isConnected = true;
        this.updateConnectionPoolMetrics();
        
        return result;
      } catch (error) {
        lastError = error;

        // Extract status code from error if available
        if (error instanceof Error) {
          const statusMatch = error.message.match(/\((\d{3})\)/);
          if (statusMatch) {
            lastStatusCode = parseInt(statusMatch[1], 10);
          }
        }

        // Check if we should retry this error
        if (!this.shouldRetryError(error, lastStatusCode)) {
          // Track error and latency for non-retryable errors
          const latency = (Date.now() - startTime) / 1000;
          connectionLatency.observe({ type: 'graphdb', operation: operationName }, latency);
          const errorType = lastStatusCode && lastStatusCode >= 400 && lastStatusCode < 500 
            ? 'client_error' 
            : 'connection_failed';
          connectionErrors.inc({ type: 'graphdb', error_type: errorType });
          this.isConnected = false;
          this.updateConnectionPoolMetrics();
          throw error;
        }

        // If this was the last attempt, don't wait
        if (attempt === maxRetries - 1) {
          // Track error and latency for final failure
          const latency = (Date.now() - startTime) / 1000;
          connectionLatency.observe({ type: 'graphdb', operation: operationName }, latency);
          const errorType = lastStatusCode && lastStatusCode >= 500 
            ? 'server_error' 
            : 'connection_failed';
          connectionErrors.inc({ type: 'graphdb', error_type: errorType });
          this.isConnected = false;
          this.updateConnectionPoolMetrics();
          break;
        }

        // Calculate delay with exponential backoff
        const delayMs = this.calculateBackoffDelay(attempt);

        // Log retry attempt
        logger.warn({
          operation: operationName,
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
          statusCode: lastStatusCode,
        }, `GraphDB ${operationName} retry attempt ${attempt + 1}/${maxRetries}`);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // All retries exhausted
    logger.error({
      operation: operationName,
      maxRetries,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      statusCode: lastStatusCode,
    }, `GraphDB ${operationName} failed after ${maxRetries} retry attempts`);

    throw lastError;
  }

  /**
   * Execute a SPARQL SELECT query and return JSON results
   * Uses fetch with HTTP agent pooling for connection reuse
   * Includes retry logic with exponential backoff and timeout handling
   * 
   * @param query - SPARQL query string
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Promise resolving to array of query result bindings
   */
  async query(query: string, maxRetries: number = this.DEFAULT_MAX_RETRIES): Promise<Record<string, string>[]> {
    return this.executeWithRetry(async () => {
      const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      const response = await this.fetchWithTimeout(
        this.queryEndpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-query',
            'Accept': 'application/sparql-results+json',
            Authorization: authHeader,
          },
          body: query,
        },
        this.DEFAULT_REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GraphDB query failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // SPARQL binding structure: { [variableName]: { value: string, type?: string } }
      interface SparqlBinding {
        value: string;
        type?: string;
      }
      
      // Convert bindings to plain objects
      return (data.results?.bindings || []).map((binding: Record<string, SparqlBinding>) => {
        const result: Record<string, string> = {};
        Object.keys(binding).forEach((key) => {
          result[key] = binding[key].value;
        });
        return result;
      });
    }, 'query', maxRetries);
  }

  /**
   * Execute a SPARQL CONSTRUCT query and return RDF triples as Turtle string
   */
  async construct(query: string): Promise<string> {
    try {
      const GetQueryPayload = graphdb.query.GetQueryPayload;
      const RDFMimeType = graphdb.http.RDFMimeType;
      const QueryType = graphdb.query.QueryType;
      
      const payload = new GetQueryPayload()
        .setQuery(query)
        .setQueryType(QueryType.CONSTRUCT)
        .setResponseType(RDFMimeType.TURTLE);
      
      const response = await this.client.query(payload);
      
      // Read the response stream as text with timeout to prevent hangs
      const chunks: Uint8Array[] = [];
      const reader = response.getReader();
      const STREAM_READ_TIMEOUT = 60000; // 60 seconds
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('GraphDB stream read timeout after 60s')), STREAM_READ_TIMEOUT);
      });
      
      try {
        while (true) {
          const readPromise = reader.read();
          const result = await Promise.race([readPromise, timeoutPromise]);
          const { done, value } = result;
          if (done) break;
          chunks.push(value);
        }
      } catch (error) {
        // Cancel the reader on timeout
        reader.cancel().catch(() => {});
        throw error;
      }
      
      // Combine chunks and decode
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      return new TextDecoder().decode(combined);
    } catch (error) {
      throw new Error(`GraphDB construct failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a SPARQL UPDATE (INSERT/DELETE) query
   * Uses fetch with HTTP agent pooling for connection reuse
   * Includes retry logic with exponential backoff and timeout handling
   * 
   * @param query - SPARQL UPDATE query string
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   */
  async update(query: string, maxRetries: number = this.DEFAULT_MAX_RETRIES): Promise<void> {
    return this.executeWithRetry(async () => {
      const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      const response = await this.fetchWithTimeout(
        this.updateEndpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sparql-update',
            Authorization: authHeader,
          },
          body: query,
        },
        this.DEFAULT_REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GraphDB update failed (${response.status}): ${errorText}`);
      }
    }, 'update', maxRetries);
  }

  /**
   * Load RDF data (Turtle, RDF/XML, N-Triples) into a named graph
   * Uses fetch with HTTP agent pooling for connection reuse
   * Includes retry logic with exponential backoff and timeout handling
   * 
   * @param rdfData - RDF data to load
   * @param contentType - MIME type of the RDF data
   * @param graphUri - Optional named graph URI
   * @param targetRepository - Optional repository name (defaults to configured repository)
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   */
  async loadRDF(
    rdfData: string,
    contentType: 'text/turtle' | 'application/rdf+xml' | 'text/n3' | 'application/n-triples',
    graphUri?: string,
    targetRepository?: string,
    maxRetries: number = this.DEFAULT_MAX_RETRIES
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const repo = targetRepository || repository;
      const params = new URLSearchParams();
      if (graphUri) {
        // GraphDB expects N-Triples format for context (wrapped in angle brackets)
        params.append('context', `<${graphUri}>`);
      }

      // Use the statements endpoint
      const url = `${baseUrl}/repositories/${repo}/statements?${params.toString()}`;
      
      const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': contentType,
            Authorization: authHeader,
          },
          body: rdfData,
        },
        this.DEFAULT_REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GraphDB load RDF failed (${response.status}): ${errorText}`);
      }
    }, 'loadRDF', maxRetries);
  }

  /**
   * Update GraphDB connection pool metrics in Prometheus
   */
  private updateConnectionPoolMetrics(): void {
    // GraphDB uses HTTP connections, so we track connection state
    const isConnectedValue = this.isConnected ? 1 : 0;
    connectionPoolSize.set({ type: 'graphdb', status: 'current' }, isConnectedValue);
    connectionPoolSize.set({ type: 'graphdb', status: 'available' }, isConnectedValue);
  }

  /**
   * Check if GraphDB is accessible and repository exists
   * Note: For GraphDB Free edition, queries may fail due to license limitations,
   * but the server and repository are still accessible. We check server/repository
   * availability rather than requiring successful queries.
   */
  async verifyConnectivity(): Promise<boolean> {
    const startTime = Date.now();
    try {
      // First, check if we can access the repository list (server is up)
      // This doesn't require a license
      const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      const reposResponse = await fetch(`${this.restEndpoint}/repositories`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': authHeader,
        },
        signal: AbortSignal.timeout(3000),
      });
      
      if (!reposResponse.ok) {
        throw new Error(`GraphDB server returned HTTP ${reposResponse.status}`);
      }
      
      // Check if repository exists
      const repos = await reposResponse.json();
      const repoExists = Array.isArray(repos) && repos.some((repo: any) => repo.id === repository);
      
      if (!repoExists) {
        throw new Error(`Repository "${repository}" not found`);
      }
      
      // Try a simple query, but don't fail if it requires a license
      // (GraphDB Free edition has license limitations)
      try {
        const testQuery = 'SELECT ?s WHERE { ?s ?p ?o } LIMIT 1';
        await this.query(testQuery);
        // Query succeeded - full connectivity
        this.isConnected = true;
      } catch (queryError) {
        const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
        // If query fails due to license, server is still accessible
        if (errorMessage.includes('License') || errorMessage.includes('No license')) {
          logger.warn({ error: errorMessage }, 'GraphDB server accessible but queries require license (GraphDB Free edition limitation)');
          // Server is accessible, repository exists, but queries need license
          // This is acceptable - mark as connected but with limitations
          this.isConnected = true;
        } else {
          // Other query errors - still consider server accessible
          logger.warn({ error: errorMessage }, 'GraphDB query failed but server is accessible');
          this.isConnected = true;
        }
      }
      
      const latency = (Date.now() - startTime) / 1000;
      connectionLatency.observe({ type: 'graphdb', operation: 'health_check' }, latency);
      this.updateConnectionPoolMetrics();
      return true;
    } catch (error) {
      const latency = (Date.now() - startTime) / 1000;
      connectionLatency.observe({ type: 'graphdb', operation: 'health_check' }, latency);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = errorMessage.includes('timeout') ? 'timeout' : 
                       errorMessage.includes('ECONNREFUSED') ? 'connection_refused' :
                       'connection_failed';
      connectionErrors.inc({ type: 'graphdb', error_type: errorType });
      
      this.isConnected = false;
      this.updateConnectionPoolMetrics();
      logger.error({ error }, 'GraphDB connectivity check failed');
      return false;
    }
  }

  // Staggered health check offset to avoid all services checking at the same time
  // MongoDB: 0s offset, Neo4j: 10s offset, GraphDB: 20s offset
  private static readonly HEALTH_CHECK_STAGGER_OFFSET_MS = 20000; // 20 seconds offset for GraphDB
  
  /**
   * Start periodic health monitoring
   * 
   * Note: GraphDB health checks are staggered by 20 seconds relative to MongoDB
   * to reduce resource contention during health check cycles.
   */
  startHealthMonitoring(): void {
    // Clear existing interval if any
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }

    // Start health checks with a staggered delay to avoid resource contention
    setTimeout(() => {
      this.healthCheckIntervalId = setInterval(async () => {
        try {
          const isHealthy = await this.verifyConnectivity();
          if (!isHealthy) {
            logger.warn('GraphDB health check failed');
          }
        } catch (error) {
          logger.error({ error }, 'GraphDB health check error');
        }
      }, env.GRAPHDB_HEALTH_CHECK_INTERVAL_MS);
      
      logger.debug({ 
        interval: env.GRAPHDB_HEALTH_CHECK_INTERVAL_MS,
        staggerOffset: GraphDBClient.HEALTH_CHECK_STAGGER_OFFSET_MS 
      }, 'Started periodic GraphDB health check monitoring (staggered)');
    }, GraphDBClient.HEALTH_CHECK_STAGGER_OFFSET_MS);
  }

  /**
   * Stop periodic health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  /**
   * Get repository information via REST API
   * Uses fetch with HTTP agent pooling for connection reuse
   */
  async getRepositoryInfo(): Promise<Record<string, unknown>> {
    try {
      const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      const url = `${this.restEndpoint}/repositories/${repository}`;
      const response = await fetchWithAgent(url, {
        headers: {
          Accept: 'application/json',
          Authorization: authHeader,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GraphDB get repository info failed (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`GraphDB get repository info failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the underlying RDFRepositoryClient for advanced operations
   */
  getRepositoryClient(): graphdb.repository.RDFRepositoryClient {
    return this.client;
  }

  /**
   * List all distinct named graphs in the repository
   * @param limit Maximum number of graphs to return (default: 100)
   * @returns Array of graph URIs
   */
  async listNamedGraphs(limit: number = 100): Promise<string[]> {
    const query = `
      SELECT DISTINCT ?g
      WHERE {
        GRAPH ?g { ?s ?p ?o }
      }
      LIMIT ${limit}
    `;

    const results = await this.query(query);
    return results.map(result => result.g);
  }

  /**
   * Get triple count for each named graph
   * @param limit Maximum number of graphs to return (default: 100)
   * @returns Array of objects with graph URI and triple count
   */
  async getGraphCounts(limit: number = 100): Promise<Array<{ graph: string; count: number }>> {
    const query = `
      SELECT ?g (COUNT(*) as ?count)
      WHERE {
        GRAPH ?g { ?s ?p ?o }
      }
      GROUP BY ?g
      ORDER BY DESC(?count)
      LIMIT ${limit}
    `;

    const results = await this.query(query);
    return results.map(result => ({
      graph: result.g,
      count: parseInt(result.count)
    }));
  }

  /**
   * Get count of triples in the default graph (no named graph)
   */
  async getDefaultGraphCount(): Promise<number> {
    const query = `
      SELECT (COUNT(*) as ?count)
      WHERE {
        ?s ?p ?o
        MINUS {
          GRAPH ?g { ?s ?p ?o }
        }
      }
    `;

    const results = await this.query(query);
    if (results.length > 0 && results[0].count) {
      return parseInt(results[0].count);
    }
    return 0;
  }
}

let client: GraphDBClient | null = null;

// Retry configuration for connection attempts
const MAX_RETRIES = 5;
const INITIAL_CONNECTION_RETRY_DELAY_MS = 1000;
const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds per attempt

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number): number {
  return INITIAL_CONNECTION_RETRY_DELAY_MS * Math.pow(2, attempt);
}

/**
 * Check GraphDB connection health
 */
export async function checkGraphDBHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  if (!client) {
    return { healthy: false, error: 'GraphDB client not initialized' };
  }

  try {
    const startTime = Date.now();
    const isConnected = await client.verifyConnectivity();
    const latency = Date.now() - startTime;

    return {
      healthy: isConnected,
      latency: isConnected ? latency : undefined,
      error: isConnected ? undefined : 'GraphDB connectivity verification failed',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      healthy: false,
      error: errorMessage,
    };
  }
}

/**
 * Connect to GraphDB and return client instance
 * Also ensures the parser is initialized (non-blocking)
 * 
 * Includes retry logic with exponential backoff to handle transient connection failures.
 * Similar to Neo4j connection logic for consistency.
 */
export async function connectGraphDB(): Promise<GraphDBClient> {
  if (client) {
    // Ensure parser is initialized even if client already exists
    ensureParserInitialized().catch((error) => {
      console.warn('⚠️  GraphDB parser initialization in progress (will retry on use):', error instanceof Error ? error.message : String(error));
    });
    return client;
  }

  let lastError: Error | null = null;

  // Retry connection attempts with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1);
        logger.warn({
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES + 1,
          delay,
        }, 'Retrying GraphDB connection...');
        await sleep(delay);
        
        // Reset client before retry
        client = null;
      }

      // Create new client instance for this attempt
      const repoClient = getRepositoryClient();
      client = new GraphDBClient(repoClient, queryEndpoint, updateEndpoint, restEndpoint);

      // Start parser initialization early (non-blocking)
      ensureParserInitialized().catch((error) => {
        console.warn('⚠️  GraphDB parser initialization in progress (will retry on use):', error instanceof Error ? error.message : String(error));
      });

      // Add timeout to connectivity check
      const connectivityCheck = client.verifyConnectivity();
      const timeout = new Promise<boolean>((_, reject) => 
        setTimeout(() => reject(new Error(`Connection timeout: GraphDB at ${queryEndpoint} is not responding`)), CONNECTION_TIMEOUT_MS)
      );
      
      const isConnected = await Promise.race([connectivityCheck, timeout]) as boolean;
      
      if (isConnected) {
        console.log(`✅ Successfully connected to GraphDB at ${queryEndpoint} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        
        // Log repository info
        try {
          const info = await client.getRepositoryInfo();
          console.log(`   Repository: ${info.id || repository}`);
        } catch (_error) {
          // Repository info might not be available, that's okay
          console.log(`   Repository: ${repository}`);
        }
        
        // Verify parser is ready (or at least initializing)
        try {
          const parserReady = isParserReady();
          if (parserReady) {
            console.log(`   Parser: ✅ Ready`);
          } else {
            console.log(`   Parser: ⏳ Initializing (will be available when needed)`);
          }
        } catch (_error) {
          // Parser initialization is in progress, that's okay
          console.log(`   Parser: ⏳ Initializing (will be available when needed)`);
        }

        // Start health monitoring
        client.startHealthMonitoring();
        
        return client;
      } else {
        throw new Error('GraphDB connectivity verification failed');
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on permanent errors (e.g., repository not found)
      if (lastError.message.includes('404') || lastError.message.includes('not found')) {
        client = null;
        console.error('❌ GraphDB connection error (permanent):', lastError);
        console.error(`   Repository "${repository}" not found`);
        console.error(`   Available repositories: Check ${restEndpoint}/repositories`);
        throw lastError;
      }
      
      // If this was the last attempt, set client to null and throw
      if (attempt === MAX_RETRIES) {
        client = null;
        console.error(`❌ GraphDB connection error after ${MAX_RETRIES + 1} attempts:`, lastError);
        if (lastError.message.includes('timeout')) {
          console.error(`   Make sure GraphDB is running at ${baseUrl}`);
          console.error(`   Check: curl ${baseUrl}/rest/repositories`);
        }
        throw lastError;
      }
      
      // Log retry attempt (will retry on next iteration)
      logger.warn({
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES + 1,
        error: lastError.message,
      }, 'GraphDB connection attempt failed, will retry...');
    }
  }

  // This should never be reached, but TypeScript needs it
  client = null;
  throw lastError || new Error('GraphDB connection failed');
}

/**
 * Get GraphDB client instance (must call connectGraphDB first)
 */
export function getGraphDBClient(): GraphDBClient {
  if (!client) {
    throw new Error(
      'GraphDB client not initialized. Call connectGraphDB() first.'
    );
  }
  return client;
}

/**
 * Close GraphDB connection (cleanup)
 * Note: Graceful shutdown is handled centrally in server/index.ts
 * This function should only be called through the shutdown coordinator
 */
export async function closeGraphDB(): Promise<void> {
  // Stop health monitoring if client exists
  if (client) {
    client.stopHealthMonitoring();
  }
  
  // Close HTTP agents to free up connections
  httpAgent.destroy();
  httpsAgent.destroy();
  await undiciAgent.close();
  
  // GraphDB uses HTTP, so no persistent connection to close
  client = null;
  repoClient = null;
  console.log('GraphDB connection closed');
}

// Export configuration for reference
export const graphDBConfig = {
  host,
  port,
  repository,
  baseUrl,
  queryEndpoint,
  updateEndpoint,
  restEndpoint,
};

/**
 * Export HTTP agents for monitoring and testing purposes
 * These agents are shared across all GraphDBClient instances and provide
 * connection pooling for improved performance.
 */
export const graphDBAgents = {
  httpAgent,
  httpsAgent,
  undiciAgent,
};
