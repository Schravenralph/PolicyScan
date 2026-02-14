/**
 * Deployment Configuration
 * 
 * Standardized runtime configuration for adapters and infrastructure.
 * Environment-specific details (URLs, keys, rate limits) live in config, not code.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/21-deployment-config-conventions.md
 */

import { getEnv, type Env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Environment names (dev, pre, prod)
 */
export type DeploymentEnvironment = 'dev' | 'pre' | 'prod';

/**
 * DSO Configuration
 */
export interface DSOConfig {
  env: DeploymentEnvironment;
  apiKey: string;
  ontsluitenBaseUrl: string;
  downloadenBaseUrl: string;
  rateLimitQps: number;
  downloadenPollIntervalMs: number;
  downloadenMaxPollSeconds: number;
}

/**
 * KOOP SRU Configuration
 */
export interface KoopSruConfig {
  baseUrl: string;
  connectionBwb: string;
  connectionCvdr: string;
  maxRecords: number;
  rateLimitQps: number;
}

/**
 * PostGIS Configuration
 */
export interface PostGISConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema: string; // POSTGIS_SCHEMA (default: 'geo')
}

/**
 * PgVector Configuration
 */
export interface PgVectorConfig {
  schema: string; // PGVECTOR_SCHEMA (default: 'vector')
  indexType: 'hnsw' | 'ivfflat';
  hnswM?: number;
  hnswEfConstruction?: number;
  ivfflatLists?: number;
}

/**
 * GraphDB Configuration
 */
export interface GraphDBConfig {
  baseUrl: string;
  repository: string;
  username?: string;
  password?: string;
  bulkLoadMode: 'sparql-update' | 'bulk-import';
}

/**
 * Complete deployment configuration
 */
export interface DeploymentConfig {
  dso: DSOConfig;
  koopSru: KoopSruConfig;
  postgis: PostGISConfig;
  pgvector: PgVectorConfig;
  graphdb: GraphDBConfig;
}

let deploymentConfig: DeploymentConfig | null = null;

/**
 * Parse deployment environment from ENVIRONMENT or DSO_ENV
 */
function parseDeploymentEnvironment(env: Env): DeploymentEnvironment {
  // Check DSO_ENV first (new standardized way)
  const dsoEnv = process.env.DSO_ENV;
  if (dsoEnv === 'dev' || dsoEnv === 'pre' || dsoEnv === 'prod') {
    return dsoEnv;
  }

  // Fallback to ENVIRONMENT (legacy)
  const environment = env.ENVIRONMENT;
  if (environment === 'production') {
    return 'prod';
  }
  if (environment === 'preproduction') {
    return 'pre';
  }

  // Default based on NODE_ENV
  if (env.NODE_ENV === 'production') {
    return 'prod';
  }
  if (env.NODE_ENV === 'development') {
    return 'dev';
  }

  return 'pre';
}

/**
 * Get DSO base URLs based on environment
 */
export function getDSOBaseUrls(env: DeploymentEnvironment): {
  ontsluiten: string;
  downloaden: string;
} {
  switch (env) {
    case 'prod':
      return {
        ontsluiten: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2',
        downloaden: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/downloaden/v1',
      };
    case 'pre':
      return {
        ontsluiten: 'https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2',
        downloaden: 'https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/downloaden/v1',
      };
    case 'dev':
      return {
        ontsluiten: 'https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsinformatie/api/ontsluiten/v2',
        downloaden: 'https://service.pre.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/downloaden/v1',
      };
  }
}

/**
 * Get DSO API key based on environment
 * Supports both new standardized DSO_API_KEY and legacy DSO_PROD_KEY/DSO_PREPROD_KEY
 */
export function getDSOApiKey(env: DeploymentEnvironment): string {
  // New standardized way: DSO_API_KEY
  const dsoApiKey = process.env.DSO_API_KEY;
  if (dsoApiKey) {
    return dsoApiKey;
  }

  // Legacy: DSO_PROD_KEY / DSO_PREPROD_KEY
  if (env === 'prod') {
    const prodKey = process.env.DSO_PROD_KEY;
    if (prodKey) {
      logger.warn('Using legacy DSO_PROD_KEY. Consider migrating to DSO_API_KEY with DSO_ENV=prod');
      return prodKey;
    }
  } else {
    const preprodKey = process.env.DSO_PREPROD_KEY;
    if (preprodKey) {
      logger.warn('Using legacy DSO_PREPROD_KEY. Consider migrating to DSO_API_KEY with DSO_ENV=pre');
      return preprodKey;
    }
  }

  throw new Error(
    `DSO API key not configured. Set DSO_API_KEY (or legacy DSO_${env === 'prod' ? 'PROD' : 'PREPROD'}_KEY) in .env`
  );
}

/**
 * Validate and load deployment configuration
 * @throws {Error} If required configuration is missing
 */
export function loadDeploymentConfig(): DeploymentConfig {
  if (deploymentConfig) {
    return deploymentConfig;
  }

  const env = getEnv();
  const deploymentEnv = parseDeploymentEnvironment(env);
  const dsoBaseUrls = getDSOBaseUrls(deploymentEnv);
  const dsoApiKey = getDSOApiKey(deploymentEnv);

  // Validate required DSO configuration
  const dsoOntsluitenBaseUrl = process.env.DSO_ONTSLUITEN_BASE_URL || dsoBaseUrls.ontsluiten;
  const dsoDownloadenBaseUrl = process.env.DSO_DOWNLOADEN_BASE_URL || dsoBaseUrls.downloaden;
  const dsoRateLimitQps = parseInt(process.env.DSO_RATE_LIMIT_QPS || '10', 10);
  const dsoDownloadenPollIntervalMs = parseInt(process.env.DSO_DOWNLOADEN_POLL_INTERVAL_MS || '2000', 10);
  const dsoDownloadenMaxPollSeconds = parseInt(process.env.DSO_DOWNLOADEN_MAX_POLL_SECONDS || '300', 10);

  // Validate KOOP SRU configuration
  const koopSruBaseUrl = process.env.KOOP_SRU_BASE_URL || 'https://zoekservice.overheid.nl/sru/Search';
  const koopSruConnectionBwb = process.env.KOOP_SRU_CONNECTION_BWB || 'BWB';
  const koopSruConnectionCvdr = process.env.KOOP_SRU_CONNECTION_CVDR || 'cvdr';
  const koopSruMaxRecords = parseInt(process.env.KOOP_SRU_MAX_RECORDS || '50', 10);
  const koopSruRateLimitQps = parseInt(process.env.KOOP_SRU_RATE_LIMIT_QPS || '5', 10);

  // Validate PostGIS configuration
  const postgisSchema = process.env.POSTGIS_SCHEMA || 'geo';
  const pgHost = process.env.PGHOST || env.POSTGRES_HOST;
  const pgPort = parseInt(process.env.PGPORT || String(env.POSTGRES_PORT), 10);
  const pgDatabase = process.env.PGDATABASE || env.POSTGRES_DB;
  const pgUser = process.env.PGUSER || env.POSTGRES_USER;
  const pgPassword = process.env.PGPASSWORD || env.POSTGRES_PASSWORD;

  // Validate PgVector configuration
  const pgvectorSchema = process.env.PGVECTOR_SCHEMA || 'vector';
  const pgvectorIndexType = (process.env.PGVECTOR_INDEX_TYPE || 'hnsw') as 'hnsw' | 'ivfflat';
  if (pgvectorIndexType !== 'hnsw' && pgvectorIndexType !== 'ivfflat') {
    throw new Error(`PGVECTOR_INDEX_TYPE must be 'hnsw' or 'ivfflat', got: ${pgvectorIndexType}`);
  }

  // Validate GraphDB configuration
  const graphdbBaseUrl = process.env.GRAPHDB_BASE_URL || `http://${env.GRAPHDB_HOST}:${env.GRAPHDB_PORT}`;
  const graphdbRepository = process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG';
  const graphdbUsername = process.env.GRAPHDB_USER || 'admin';
  const graphdbPassword = process.env.GRAPHDB_PASSWORD || 'root';
  const graphdbBulkLoadMode = (process.env.GRAPHDB_BULK_LOAD_MODE || 'sparql-update') as 'sparql-update' | 'bulk-import';
  if (graphdbBulkLoadMode !== 'sparql-update' && graphdbBulkLoadMode !== 'bulk-import') {
    throw new Error(`GRAPHDB_BULK_LOAD_MODE must be 'sparql-update' or 'bulk-import', got: ${graphdbBulkLoadMode}`);
  }

  // Validate rate limits are safe (below published throttling limits)
  if (dsoRateLimitQps > 10) {
    logger.warn(`DSO_RATE_LIMIT_QPS (${dsoRateLimitQps}) exceeds recommended limit of 10 QPS`);
  }
  if (koopSruRateLimitQps > 10) {
    logger.warn(`KOOP_SRU_RATE_LIMIT_QPS (${koopSruRateLimitQps}) exceeds recommended limit of 10 QPS`);
  }

  deploymentConfig = {
    dso: {
      env: deploymentEnv,
      apiKey: dsoApiKey,
      ontsluitenBaseUrl: dsoOntsluitenBaseUrl,
      downloadenBaseUrl: dsoDownloadenBaseUrl,
      rateLimitQps: dsoRateLimitQps,
      downloadenPollIntervalMs: dsoDownloadenPollIntervalMs,
      downloadenMaxPollSeconds: dsoDownloadenMaxPollSeconds,
    },
    koopSru: {
      baseUrl: koopSruBaseUrl,
      connectionBwb: koopSruConnectionBwb,
      connectionCvdr: koopSruConnectionCvdr,
      maxRecords: koopSruMaxRecords,
      rateLimitQps: koopSruRateLimitQps,
    },
    postgis: {
      host: pgHost,
      port: pgPort,
      database: pgDatabase,
      user: pgUser,
      password: pgPassword,
      schema: postgisSchema,
    },
    pgvector: {
      schema: pgvectorSchema,
      indexType: pgvectorIndexType,
      hnswM: env.PGVECTOR_HNSW_M,
      hnswEfConstruction: env.PGVECTOR_HNSW_EF_CONSTRUCTION,
      ivfflatLists: env.PGVECTOR_IVFFLAT_LISTS,
    },
    graphdb: {
      baseUrl: graphdbBaseUrl,
      repository: graphdbRepository,
      username: graphdbUsername,
      password: graphdbPassword,
      bulkLoadMode: graphdbBulkLoadMode,
    },
  };

  return deploymentConfig;
}

/**
 * Get deployment configuration (loads if not already loaded)
 */
export function getDeploymentConfig(): DeploymentConfig {
  return loadDeploymentConfig();
}

/**
 * Redact secrets from configuration for logging
 */
export function redactConfig(config: DeploymentConfig): Record<string, unknown> {
  return {
    dso: {
      env: config.dso.env,
      apiKey: config.dso.apiKey ? '***REDACTED***' : undefined,
      ontsluitenBaseUrl: config.dso.ontsluitenBaseUrl,
      downloadenBaseUrl: config.dso.downloadenBaseUrl,
      rateLimitQps: config.dso.rateLimitQps,
      downloadenPollIntervalMs: config.dso.downloadenPollIntervalMs,
      downloadenMaxPollSeconds: config.dso.downloadenMaxPollSeconds,
    },
    koopSru: config.koopSru,
    postgis: {
      host: config.postgis.host,
      port: config.postgis.port,
      database: config.postgis.database,
      user: config.postgis.user,
      password: config.postgis.password ? '***REDACTED***' : undefined,
      schema: config.postgis.schema,
    },
    pgvector: config.pgvector,
    graphdb: {
      baseUrl: config.graphdb.baseUrl,
      repository: config.graphdb.repository,
      username: config.graphdb.username,
      password: config.graphdb.password ? '***REDACTED***' : undefined,
      bulkLoadMode: config.graphdb.bulkLoadMode,
    },
  };
}

/**
 * Print redacted configuration summary at startup
 */
export function printConfigSummary(): void {
  try {
    const config = getDeploymentConfig();
    const redacted = redactConfig(config);
    
    logger.info('📋 Deployment Configuration Summary:');
    logger.info({ config: redacted }, 'Configuration loaded and validated');
    
    // Print warnings for missing optional config
    if (!config.dso.apiKey) {
      logger.warn('⚠️  DSO API key not configured - DSO services will not work');
    }
    if (!config.graphdb.password || config.graphdb.password === 'root') {
      logger.warn('⚠️  GraphDB using default password - set GRAPHDB_PASSWORD for production');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to load deployment configuration');
    throw error;
  }
}

