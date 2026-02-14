import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from './logger.js';

/**
 * Prometheus metrics registry
 */
export const metricsRegistry = new Registry();

// Default metrics (CPU, memory, etc.)
// Note: prom-client doesn't include default metrics by default in newer versions
// We'll create custom metrics instead

/**
 * HTTP Request Metrics
 * Includes run_id label for E2E test correlation (optional, set to empty string when not present)
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'run_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [metricsRegistry],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'run_id'],
  registers: [metricsRegistry],
});

/**
 * Business Metrics
 */
export const queriesProcessed = new Counter({
  name: 'queries_processed_total',
  help: 'Total number of queries processed',
  labelNames: ['status'],
  registers: [metricsRegistry],
});

export const documentsScraped = new Counter({
  name: 'documents_scraped_total',
  help: 'Total number of documents scraped',
  labelNames: ['source', 'status'],
  registers: [metricsRegistry],
});

export const llmCalls = new Counter({
  name: 'llm_calls_total',
  help: 'Total number of LLM API calls',
  labelNames: ['provider', 'model', 'status'],
  registers: [metricsRegistry],
});

export const llmCallDuration = new Histogram({
  name: 'llm_call_duration_seconds',
  help: 'Duration of LLM API calls in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry],
});

export const databaseOperations = new Counter({
  name: 'database_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'collection', 'status'],
  registers: [metricsRegistry],
});

export const databaseOperationDuration = new Histogram({
  name: 'database_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

/**
 * System Metrics
 */
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [metricsRegistry],
});

export const memoryUsage = new Gauge({
  name: 'memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

/**
 * MongoDB Connection Pool Metrics
 */
export const mongodbConnectionPoolSize = new Gauge({
  name: 'mongodb_connection_pool_size',
  help: 'MongoDB connection pool size',
  labelNames: ['type'], // 'min', 'max', 'current', 'available'
  registers: [metricsRegistry],
});

export const mongodbConnectionPoolEvents = new Counter({
  name: 'mongodb_connection_pool_events_total',
  help: 'Total number of MongoDB connection pool events',
  labelNames: ['event_type'], // 'created', 'closed', 'checkout', 'checkin', 'checkout_failed'
  registers: [metricsRegistry],
});

export const mongodbConnectionState = new Gauge({
  name: 'mongodb_connection_state',
  help: 'MongoDB connection state (1 = connected, 0 = disconnected)',
  registers: [metricsRegistry],
});

export const mongodbReconnectionAttempts = new Counter({
  name: 'mongodb_reconnection_attempts_total',
  help: 'Total number of MongoDB reconnection attempts',
  labelNames: ['status'], // 'success', 'failure'
  registers: [metricsRegistry],
});

export const mongodbHealthCheckLatency = new Histogram({
  name: 'mongodb_health_check_latency_seconds',
  help: 'MongoDB health check latency in seconds',
  labelNames: ['status'], // 'success', 'failure'
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [metricsRegistry],
});

/**
 * Generic Connection Metrics for All Connection Types
 * These metrics follow a consistent pattern across MongoDB, Neo4j, Redis, and GraphDB
 */

/**
 * Connection Pool Size Gauge
 * Tracks pool size metrics (min, max, current, available) for all connection types
 * Labels: ['type', 'status']
 *   - type: 'mongodb', 'neo4j', 'redis', 'graphdb'
 *   - status: 'min', 'max', 'current', 'available'
 */
export const connectionPoolSize = new Gauge({
  name: 'connection_pool_size',
  help: 'Connection pool size for all connection types',
  labelNames: ['type', 'status'],
  registers: [metricsRegistry],
});

/**
 * Connection Errors Counter
 * Tracks connection errors for all connection types
 * Labels: ['type', 'error_type']
 *   - type: 'mongodb', 'neo4j', 'redis', 'graphdb'
 *   - error_type: 'connection_failed', 'timeout', 'authentication', 'network', 'pool_exhausted', etc.
 */
export const connectionErrors = new Counter({
  name: 'connection_errors_total',
  help: 'Total number of connection errors for all connection types',
  labelNames: ['type', 'error_type'],
  registers: [metricsRegistry],
});

/**
 * Connection Latency Histogram
 * Tracks connection operation latency for all connection types
 * Labels: ['type', 'operation']
 *   - type: 'mongodb', 'neo4j', 'redis', 'graphdb'
 *   - operation: 'connect', 'query', 'health_check', 'reconnect', etc.
 */
export const connectionLatency = new Histogram({
  name: 'connection_latency_seconds',
  help: 'Connection operation latency in seconds for all connection types',
  labelNames: ['type', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

/**
 * LearningService Metrics
 */

/**
 * Learning Operation Duration Histogram
 * Tracks execution time for each learning operation
 * Labels: ['operation']
 *   - operation: 'calculateRankingBoosts', 'discoverNewTerms', 'updateSourceQuality', 
 *                'runLearningCycle', 'analyzePatternEffectiveness', etc.
 */
export const learningOperationDuration = new Histogram({
  name: 'learning_operation_duration_seconds',
  help: 'Duration of learning service operations in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

/**
 * Learning Operation Counter
 * Tracks total number of learning operations
 * Labels: ['operation', 'status']
 *   - operation: 'calculateRankingBoosts', 'discoverNewTerms', etc.
 *   - status: 'success', 'failure', 'timeout'
 */
export const learningOperationsTotal = new Counter({
  name: 'learning_operations_total',
  help: 'Total number of learning service operations',
  labelNames: ['operation', 'status'],
  registers: [metricsRegistry],
});

/**
 * Learning Timeout Counter
 * Tracks timeout occurrences for learning operations
 * Labels: ['operation']
 *   - operation: 'calculateRankingBoosts', 'discoverNewTerms', etc.
 */
export const learningTimeouts = new Counter({
  name: 'learning_timeouts_total',
  help: 'Total number of timeouts in learning service operations',
  labelNames: ['operation'],
  registers: [metricsRegistry],
});

/**
 * Learning Memory Usage Gauge
 * Tracks memory usage during learning operations
 * Labels: ['operation', 'phase']
 *   - operation: 'calculateRankingBoosts', 'discoverNewTerms', etc.
 *   - phase: 'before', 'after', 'peak'
 */
export const learningMemoryUsage = new Gauge({
  name: 'learning_memory_usage_bytes',
  help: 'Memory usage during learning operations in bytes',
  labelNames: ['operation', 'phase'],
  registers: [metricsRegistry],
});

/**
 * Learning Cycle Results Gauge
 * Tracks results from learning cycles
 * Labels: ['metric']
 *   - metric: 'ranking_boosts', 'dictionary_updates', 'source_updates', 
 *            'terms_added', 'synonyms_added', 'sources_deprecated'
 */
export const learningCycleResults = new Gauge({
  name: 'learning_cycle_results',
  help: 'Results from learning cycles (counts)',
  labelNames: ['metric'],
  registers: [metricsRegistry],
});

/**
 * Learning Scheduler Metrics
 */

/**
 * Learning Scheduler Execution Counter
 * Tracks scheduled task executions
 * Labels: ['task', 'status']
 *   - task: 'rankings', 'dictionaries', 'sources', 'monthly_review'
 *   - status: 'started', 'completed', 'skipped', 'failed'
 */
export const learningSchedulerExecutions = new Counter({
  name: 'learning_scheduler_executions_total',
  help: 'Total number of scheduled learning task executions',
  labelNames: ['task', 'status'],
  registers: [metricsRegistry],
});

/**
 * Learning Scheduler Concurrent Execution Counter
 * Tracks when scheduled tasks are skipped due to concurrent execution
 * Labels: ['task']
 *   - task: 'rankings', 'dictionaries', 'sources', 'monthly_review'
 */
export const learningSchedulerSkipped = new Counter({
  name: 'learning_scheduler_skipped_total',
  help: 'Total number of scheduled tasks skipped due to concurrent execution',
  labelNames: ['task'],
  registers: [metricsRegistry],
});

/**
 * Database Cleanup Metrics
 */

/**
 * Database Cleanup Operations Counter
 * Tracks total number of cleanup operations by collection and status
 * Labels: ['collection', 'status']
 *   - collection: The collection name (e.g., 'scraping_progress', 'job_progress')
 *   - status: 'success', 'failed'
 */
export const databaseCleanupOperationsTotal = new Counter({
  name: 'database_cleanup_operations_total',
  help: 'Total number of database cleanup operations',
  labelNames: ['collection', 'status'],
  registers: [metricsRegistry],
});

/**
 * Database Cleanup Records Deleted Counter
 * Tracks total number of records deleted during cleanup
 * Labels: ['collection']
 *   - collection: The collection name
 */
export const databaseCleanupRecordsDeletedTotal = new Counter({
  name: 'database_cleanup_records_deleted_total',
  help: 'Total number of records deleted during cleanup',
  labelNames: ['collection'],
  registers: [metricsRegistry],
});

/**
 * Database Cleanup Duration Histogram
 * Tracks duration of cleanup operations in seconds
 * Labels: ['collection']
 *   - collection: The collection name
 * Buckets: 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300 seconds
 */
export const databaseCleanupDurationSeconds = new Histogram({
  name: 'database_cleanup_duration_seconds',
  help: 'Duration of database cleanup operations in seconds',
  labelNames: ['collection'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

/**
 * Database Size Gauge
 * Tracks current database size in GB
 */
export const databaseSizeGB = new Gauge({
  name: 'database_size_gb',
  help: 'Current database size in GB',
  registers: [metricsRegistry],
});

/**
 * Collection Size Gauge
 * Tracks current size of individual collections in MB
 * Labels: ['collection']
 *   - collection: The collection name
 */
export const collectionSizeMB = new Gauge({
  name: 'collection_size_mb',
  help: 'Current size of collections in MB',
  labelNames: ['collection'],
  registers: [metricsRegistry],
});

/**
 * Workflow Execution Metrics
 */

/**
 * Workflow Execution Counter
 * Tracks total number of workflow executions by status
 * Labels: ['workflow_id', 'status']
 *   - workflow_id: The workflow identifier
 *   - status: 'success', 'failed', 'timeout', 'cancelled'
 */
export const workflowExecutionsTotal = new Counter({
  name: 'workflow_executions_total',
  help: 'Total number of workflow executions',
  labelNames: ['workflow_id', 'status'],
  registers: [metricsRegistry],
});

/**
 * Workflow Execution Duration Histogram
 * Tracks duration of workflow executions
 * Labels: ['workflow_id']
 *   - workflow_id: The workflow identifier
 * Buckets: 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600, 1800 seconds
 */
export const workflowDuration = new Histogram({
  name: 'workflow_duration_seconds',
  help: 'Duration of workflow execution in seconds',
  labelNames: ['workflow_id'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600, 1800],
  registers: [metricsRegistry],
});

/**
 * Active Workflows Gauge
 * Tracks number of currently active workflows
 * Labels: ['workflow_id']
 *   - workflow_id: The workflow identifier
 */
export const activeWorkflows = new Gauge({
  name: 'workflow_active_count',
  help: 'Number of currently active workflows',
  labelNames: ['workflow_id'],
  registers: [metricsRegistry],
});

/**
 * Workflow Step Execution Duration Histogram
 * Tracks duration of individual workflow step executions
 * Labels: ['workflow_id', 'step_id']
 *   - workflow_id: The workflow identifier
 *   - step_id: The step identifier
 * Buckets: 0.1, 0.5, 1, 5, 10, 30, 60, 120 seconds
 */
export const workflowStepDuration = new Histogram({
  name: 'workflow_step_duration_seconds',
  help: 'Duration of workflow step execution in seconds',
  labelNames: ['workflow_id', 'step_id'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [metricsRegistry],
});

/**
 * Workflow Step Execution Counter
 * Tracks total number of workflow step executions by status
 * Labels: ['workflow_id', 'step_id', 'status']
 *   - workflow_id: The workflow identifier
 *   - step_id: The step identifier
 *   - status: 'success', 'failed', 'timeout', 'skipped'
 */
export const workflowStepExecutionsTotal = new Counter({
  name: 'workflow_step_executions_total',
  help: 'Total number of workflow step executions',
  labelNames: ['workflow_id', 'step_id', 'status'],
  registers: [metricsRegistry],
});

/**
 * Workflow Error Rate Counter
 * Tracks workflow errors by type
 * Labels: ['workflow_id', 'error_type']
 *   - workflow_id: The workflow identifier
 *   - error_type: 'timeout', 'validation', 'execution', 'external_service', 'unknown'
 */
export const workflowErrorsTotal = new Counter({
  name: 'workflow_errors_total',
  help: 'Total number of workflow errors',
  labelNames: ['workflow_id', 'error_type'],
  registers: [metricsRegistry],
});

/**
 * Workflow Resource Usage Gauge
 * Tracks resource usage during workflow execution
 * Labels: ['workflow_id', 'resource_type']
 *   - workflow_id: The workflow identifier
 *   - resource_type: 'memory_bytes', 'cpu_percent', 'network_bytes'
 */
export const workflowResourceUsage = new Gauge({
  name: 'workflow_resource_usage',
  help: 'Resource usage during workflow execution',
  labelNames: ['workflow_id', 'resource_type'],
  registers: [metricsRegistry],
});

/**
 * Workflow Queue Depth Gauge
 * Tracks the number of workflows waiting in the queue
 * Labels: ['queue_name', 'status']
 *   - queue_name: The queue name (e.g., 'workflow')
 *   - status: 'waiting', 'active', 'delayed', 'completed', 'failed'
 */
export const workflowQueueDepth = new Gauge({
  name: 'workflow_queue_depth',
  help: 'Number of workflows in the queue by status',
  labelNames: ['queue_name', 'status'],
  registers: [metricsRegistry],
});

/**
 * Navigation Graph Metrics
 */
export const navigationGraphNodesTotal = new Gauge({
  name: 'navigation_graph_nodes_total',
  help: 'Total number of nodes in the navigation graph',
  registers: [metricsRegistry],
});

export const navigationGraphNodesAdded = new Counter({
  name: 'navigation_graph_nodes_added_total',
  help: 'Total number of nodes added to the navigation graph',
  labelNames: ['change_type', 'workflow_id'], // change_type: 'added', 'updated', 'unchanged'
  registers: [metricsRegistry],
});

export const navigationGraphEdgesAdded = new Counter({
  name: 'navigation_graph_edges_added_total',
  help: 'Total number of edges added to the navigation graph',
  labelNames: ['workflow_id'],
  registers: [metricsRegistry],
});

export const navigationGraphConnectivityRatio = new Gauge({
  name: 'navigation_graph_connectivity_ratio',
  help: 'Connectivity ratio of the navigation graph (edges per node)',
  labelNames: ['workflow_id'],
  registers: [metricsRegistry],
});

export const navigationGraphPersistenceDuration = new Histogram({
  name: 'navigation_graph_persistence_duration_seconds',
  help: 'Duration of navigation graph persistence operations in seconds',
  labelNames: ['operation'], // 'add_node', 'batch_update', 'save'
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const navigationGraphPersistenceErrors = new Counter({
  name: 'navigation_graph_persistence_errors_total',
  help: 'Total number of navigation graph persistence errors',
  labelNames: ['operation', 'error_type'], // operation: 'add_node', 'batch_update', 'save'
  registers: [metricsRegistry],
});

export const navigationGraphNeo4jOperations = new Counter({
  name: 'navigation_graph_neo4j_operations_total',
  help: 'Total number of Neo4j operations for navigation graph',
  labelNames: ['operation_type', 'status'], // operation_type: 'read', 'write', 'delete', 'status': 'success', 'failure', 'retry'
  registers: [metricsRegistry],
});

export const navigationGraphNeo4jOperationDuration = new Histogram({
  name: 'navigation_graph_neo4j_operation_duration_seconds',
  help: 'Duration of Neo4j operations for navigation graph in seconds',
  labelNames: ['operation_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

/**
 * Navigation Graph Integrity Metrics
 */
export const navigationGraphIntegrityChecks = new Counter({
  name: 'navigation_graph_integrity_checks_total',
  help: 'Total number of navigation graph integrity checks run',
  labelNames: ['status'], // 'success' or 'failed'
  registers: [metricsRegistry],
});

export const navigationGraphIntegrityCheckDuration = new Histogram({
  name: 'navigation_graph_integrity_check_duration_seconds',
  help: 'Duration of navigation graph integrity checks in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [metricsRegistry],
});

export const navigationGraphIntegrityStatus = new Gauge({
  name: 'navigation_graph_integrity_status',
  help: 'Navigation graph integrity status (1 = valid, 0 = invalid)',
  registers: [metricsRegistry],
});

export const navigationGraphIntegrityIssues = new Gauge({
  name: 'navigation_graph_integrity_issues',
  help: 'Number of integrity issues found in the navigation graph',
  labelNames: ['issue_type'], // 'broken_relationships', 'missing_type', 'missing_url'
  registers: [metricsRegistry],
});

export const navigationGraphBrokenRelationshipsCleaned = new Counter({
  name: 'navigation_graph_broken_relationships_cleaned_total',
  help: 'Total number of broken relationships cleaned up',
  registers: [metricsRegistry],
});

export const navigationGraphValidRelationships = new Gauge({
  name: 'navigation_graph_valid_relationships',
  help: 'Number of valid relationships in the navigation graph',
  registers: [metricsRegistry],
});

export const navigationGraphBrokenRelationships = new Gauge({
  name: 'navigation_graph_broken_relationships',
  help: 'Number of broken relationships in the navigation graph',
  registers: [metricsRegistry],
});

/**
 * Interval ID for memory metrics collection (stored for cleanup)
 */
let metricsIntervalId: NodeJS.Timeout | null = null;

/**
 * Whether metrics collection has been initialized
 */
let isInitialized = false;

/**
 * Default collection interval in milliseconds (10 seconds)
 * Can be overridden via METRICS_COLLECTION_INTERVAL_MS environment variable
 */
const DEFAULT_COLLECTION_INTERVAL_MS = 10000;

/**
 * Get the configured collection interval
 */
function getCollectionInterval(): number {
  const envInterval = process.env.METRICS_COLLECTION_INTERVAL_MS;
  if (envInterval) {
    const parsed = parseInt(envInterval, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    logger.warn(
      { provided: envInterval },
      'Invalid METRICS_COLLECTION_INTERVAL_MS, using default'
    );
  }
  return DEFAULT_COLLECTION_INTERVAL_MS;
}

/**
 * Collect memory metrics (extracted for testability and error handling)
 */
function collectMemoryMetrics(): void {
  try {
    const memUsage = process.memoryUsage();
    memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
    memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
    memoryUsage.set({ type: 'external' }, memUsage.external);
    memoryUsage.set({ type: 'rss' }, memUsage.rss);
  } catch (error) {
    logger.error({ error }, 'Failed to collect memory metrics');
  }
}

/**
 * Initialize metrics collection
 * 
 * @throws {Error} If initialization fails
 * @remarks This function is idempotent - calling it multiple times has no effect
 */
export function initializeMetrics(): void {
  // Idempotency check: prevent multiple initializations
  if (isInitialized) {
    logger.warn('Metrics already initialized, skipping');
    return;
  }

  try {
    const intervalMs = getCollectionInterval();
    
    // Collect metrics immediately, not wait for first interval
    collectMemoryMetrics();
    
    // Collect default system metrics periodically
    metricsIntervalId = setInterval(() => {
      collectMemoryMetrics();
    }, intervalMs);

    isInitialized = true;
    logger.info({ intervalMs }, 'Metrics initialized');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error }, 'Failed to initialize metrics');
    throw new Error(`Failed to initialize metrics: ${errorMessage}`);
  }
}

/**
 * Cleanup metrics collection (clears interval)
 * Should be called during graceful shutdown
 * 
 * @remarks This function is idempotent - safe to call multiple times
 */
export function cleanupMetrics(): void {
  if (metricsIntervalId !== null) {
    clearInterval(metricsIntervalId);
    metricsIntervalId = null;
    logger.info('Metrics collection stopped');
  }
  
  if (isInitialized) {
    isInitialized = false;
  }
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

