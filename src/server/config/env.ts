/**
 * Environment Variable Validation
 * 
 * Centralized validation of all environment variables using Zod.
 * This ensures type safety, validates values, and provides clear error messages.
 */

// Environment validation uses manual parsing instead of Zod 
// to avoid compatibility issues with Zod v4

// Load dotenv early to ensure environment variables are available when IIFEs execute
import * as dotenv from 'dotenv';
dotenv.config();

import { getServiceHostnameStrict, isRunningInDocker } from '../utils/dockerDetection.js';
import { logger } from '../utils/logger.js';

/**
 * Helper function to safely parse a number from string with default
 */
function parseNumericEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

function parseFloatEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value === 'true';
}

/**
 * Environment configuration type
 * Simplified validation to avoid Zod v4 compatibility issues
 */
export interface Env {
  // Server Configuration
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;

  // Security Configuration
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JURISDICTIONS_SECRET: string;
  
  // Database Configuration
  MONGODB_URI?: string;
  DB_NAME: string;
  DB_MAX_RETRIES: number;
  DB_INITIAL_RETRY_DELAY: number;
  DB_MAX_RETRY_DELAY: number;
  DB_MAX_POOL_SIZE: number;
  DB_MIN_POOL_SIZE: number;
  DB_MAX_IDLE_TIME_MS: number;
  DB_MAX_CONNECTION_LIFETIME_MS: number;
  DB_CONNECT_TIMEOUT_MS: number;
  DB_SERVER_SELECTION_TIMEOUT_MS: number;
  DB_HEALTH_CHECK_INTERVAL: number;
  DB_RECONNECTION_MAX_RETRIES: number;
  MONGODB_LOG_POOL_EVENTS: boolean;
  DB_READ_PREFERENCE: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
  DB_READ_CONCERN_LEVEL: 'local' | 'available' | 'majority' | 'snapshot' | 'linearizable';
  DB_WRITE_CONCERN_W: 'majority' | number | string;
  
  // Neo4j Configuration
  NEO4J_URI?: string;
  NEO4J_USER: string;
  NEO4J_PASSWORD: string;
  NEO4J_MAX_CONNECTION_LIFETIME_MS: number;
  NEO4J_MAX_POOL_SIZE: number;
  NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS: number;
  NEO4J_HEALTH_CHECK_INTERVAL_MS: number;
  
  // GraphDB Configuration
  GRAPHDB_HOST: string;
  GRAPHDB_PORT: number;
  GRAPHDB_LICENSE_PATH?: string;
  GRAPHDB_HEALTH_CHECK_INTERVAL_MS: number;
  
  // Redis Configuration
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_CONNECTION_MODE: 'single' | 'cluster' | 'sentinel';
  REDIS_MAX_RETRIES_PER_REQUEST: number;
  REDIS_CONNECT_TIMEOUT: number;
  REDIS_COMMAND_TIMEOUT: number;
  REDIS_KEEP_ALIVE: number;
  REDIS_POOL_SIZE: number;
  
  // PostgreSQL Configuration
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  
  // pgvector Configuration
  PGVECTOR_SCHEMA: string;
  PGVECTOR_INDEX_TYPE: 'hnsw' | 'ivfflat';
  PGVECTOR_HNSW_M: number;
  PGVECTOR_HNSW_EF_CONSTRUCTION: number;
  PGVECTOR_IVFFLAT_LISTS: number;
  
  // API Keys
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  GEMINI_TIMEOUT: number;
  GOOGLE_CUSTOM_SEARCH_JSON_API_KEY?: string;
  GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID?: string;
  
  // KOOP SRU Configuration
  KOOP_SRU_BASE_URL?: string;
  KOOP_SRU_CONNECTION_BWB?: string;
  KOOP_SRU_CONNECTION_CVDR?: string;
  KOOP_SRU_MAX_RECORDS?: number;
  KOOP_SRU_RATE_LIMIT_QPS?: number;

  // Ollama / Local LLM Configuration
  OLLAMA_API_URL: string;
  RERANKER_MODEL?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_TIMEOUT: number;
  
  // Environment Mode
  ENVIRONMENT: 'production' | 'preproduction';
  
  // CORS Configuration
  ALLOWED_ORIGINS?: string;
  
  // Frontend Configuration
  FRONTEND_URL: string;
  VITE_API_URL?: string;
  VITE_FORCE_OPTIMIZE: boolean;
  
  // Logging Configuration
  LOG_LEVEL?: string;
  LOG_PRETTY?: string;
  LOG_REQUESTS?: string;
  LOG_STACK_TRACES?: string;

  // Vector Service Configuration
  VECTOR_SERVICE_DEVICE?: 'cpu' | 'gpu' | 'webgpu';
  VECTOR_SERVICE_USE_GPU: boolean;
  VECTOR_SERVICE_MODEL?: string;
  
  // Feature Flags
  VIDEO_CLEANUP_ENABLED: boolean;
  REVIEW_AUTOMATION_ENABLED: boolean;
  USE_MOCK_WEBSITE_SUGGESTIONS: boolean;
  CACHE_REDIS_ENABLED: boolean;
  
  // Docker Detection
  DOCKER_CONTAINER?: string;
  HOSTNAME?: string;
  
  // Pattern Learning Configuration
  PATTERN_LEARNING_ENABLED: boolean;
  PATTERN_LEARNING_MIN_CONFIDENCE: number;
  PATTERN_LEARNING_MIN_MATCH_SCORE: number;
  PATTERN_LEARNING_DEPRECATION_THRESHOLD: number;
  PATTERN_LEARNING_AUTO_DEPRECATE_AFTER_FAILURES: number;
  PATTERN_LEARNING_MATCHER_STRATEGY: 'semantic' | 'structural' | 'hybrid';
  
  // Score Weights
  SCORE_KEYWORD_WEIGHT: number;
  SCORE_SEMANTIC_WEIGHT: number;
  
  // ML Scoring Configuration
  ML_SCORING_ENABLED: boolean;
  ML_SCORING_SERVICE_URL?: string;
  ML_SCORING_TIMEOUT_MS: number;

  // Workflow Configuration
  WORKFLOW_STEP_DEFAULT_TIMEOUT_MS: number; // Default timeout for workflow steps in milliseconds
  RUN_TIMEOUT_MS: number; // Timeout for runs (pending/running) before marking as failed (default: 1 hour)
  CRAWLER_ALLOWED_DOMAINS?: string; // Comma-separated list of allowed domains for BFS crawlers

  // Graph Structure Schedule Configuration
  GRAPH_STRUCTURE_BUILD_ENABLED: boolean;
  GRAPH_STRUCTURE_BUILD_HOUR: number;
  GRAPH_STRUCTURE_BUILD_STRATEGY: 'hierarchical' | 'semantic' | 'clustered';
  GRAPH_STRUCTURE_BUILD_MAX_DEPTH: number;
  GRAPH_STRUCTURE_BUILD_MIN_GROUP_SIZE: number;
}

let validatedEnv: Env | null = null;

/**
 * Validate and return environment variables
 * Uses safe parsing with defaults to avoid Zod v4 compatibility issues
 * @throws {Error} If required validation fails
 */
export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  const errors: string[] = [];
  
  // Validate NODE_ENV
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    errors.push(`NODE_ENV: Invalid value "${nodeEnv}". Must be development, production, or test.`);
  }
  
  // Validate PORT
  const port = parseNumericEnv(process.env.PORT, 4000);
  if (port < 1 || port > 65535) {
    errors.push(`PORT: Invalid value "${process.env.PORT}". Must be between 1 and 65535.`);
  }

  // Validate JWT_SECRET
  // Security: Enforce strong secret in all environments
  let jwtSecret = process.env.JWT_SECRET;

  // In test environment, provide a default if missing to avoid breaking tests
  if (nodeEnv === 'test' && !jwtSecret) {
    jwtSecret = 'test-jwt-secret-key';
  }

  if (!jwtSecret) {
    errors.push('JWT_SECRET: Environment variable is required.');
  } else if (jwtSecret.includes('change-in-production')) {
    errors.push('JWT_SECRET: You are using the default weak secret. Please set a secure unique secret.');
  }

  // Validate JURISDICTIONS_SECRET
  // Security: Enforce secret in all environments
  let jurisdictionsSecret = process.env.JURISDICTIONS_SECRET;

  // In test environment, provide a default if missing to avoid breaking tests
  if (nodeEnv === 'test' && !jurisdictionsSecret) {
    jurisdictionsSecret = 'test-jurisdictions-secret-key';
  }

  if (!jurisdictionsSecret) {
    errors.push('JURISDICTIONS_SECRET: Environment variable is required.');
  } else if (jurisdictionsSecret.includes('change-in-production')) {
    errors.push('JURISDICTIONS_SECRET: You are using the default weak secret. Please set a secure unique secret.');
  }
  
  // Validate ENVIRONMENT
  const environment = process.env.ENVIRONMENT || 'production';
  if (!['production', 'preproduction'].includes(environment)) {
    errors.push(`ENVIRONMENT: Invalid value "${environment}". Must be production or preproduction.`);
  }
  
  // Validate pool sizes
  // Recommended pool sizes:
  // - MongoDB: min 2-5, max 10-50 (depending on workload)
  // - Neo4j: max 50 (default), can go up to 100 for high-traffic scenarios
  // - Redis: 1-10 for single connection mode, 1-50 for connection pooling
  const maxPoolSize = parseNumericEnv(process.env.DB_MAX_POOL_SIZE, 10);
  if (maxPoolSize < 1) {
    errors.push(`DB_MAX_POOL_SIZE: Invalid value "${process.env.DB_MAX_POOL_SIZE}". Must be at least 1.`);
  }
  // Warning for values > 100 (high but not invalid)
  if (maxPoolSize > 100) {
    logger.warn(`DB_MAX_POOL_SIZE (${maxPoolSize}) is greater than 100. This may cause high memory usage. Recommended: 10-50 for most workloads.`);
  }
  
  const minPoolSize = parseNumericEnv(process.env.DB_MIN_POOL_SIZE, 2);
  if (minPoolSize < 1) {
    errors.push(`DB_MIN_POOL_SIZE: Invalid value "${process.env.DB_MIN_POOL_SIZE}". Must be at least 1.`);
  }
  if (minPoolSize > 50) {
    logger.warn(`DB_MIN_POOL_SIZE (${minPoolSize}) is greater than 50. This may cause high memory usage. Recommended: 2-5 for most workloads.`);
  }
  
  if (minPoolSize > maxPoolSize) {
    errors.push(`DB_MIN_POOL_SIZE (${minPoolSize}) cannot be greater than DB_MAX_POOL_SIZE (${maxPoolSize}).`);
  }
  
  // Validate Neo4j pool size
  // Recommended: 10-50 for most workloads, up to 100 for high-traffic scenarios
  const neo4jPoolSize = parseNumericEnv(process.env.NEO4J_MAX_POOL_SIZE, 50);
  if (neo4jPoolSize < 1) {
    errors.push(`NEO4J_MAX_POOL_SIZE: Invalid value "${process.env.NEO4J_MAX_POOL_SIZE}". Must be at least 1.`);
  }
  if (neo4jPoolSize > 100) {
    logger.warn(`NEO4J_MAX_POOL_SIZE (${neo4jPoolSize}) is greater than 100. This may cause high memory usage. Recommended: 10-50 for most workloads.`);
  }
  
  // Validate Redis pool size
  // Recommended: 1-10 for single connection mode, 1-50 for connection pooling
  const redisPoolSize = parseNumericEnv(process.env.REDIS_POOL_SIZE, 1);
  if (redisPoolSize < 1) {
    errors.push(`REDIS_POOL_SIZE: Invalid value "${process.env.REDIS_POOL_SIZE}". Must be at least 1.`);
  }
  if (redisPoolSize > 50) {
    logger.warn(`REDIS_POOL_SIZE (${redisPoolSize}) is greater than 50. This may cause high memory usage. Recommended: 1-10 for most workloads.`);
  }
  
  // Validate matcher strategy
  const matcherStrategy = process.env.PATTERN_LEARNING_MATCHER_STRATEGY || 'hybrid';
  if (!['semantic', 'structural', 'hybrid'].includes(matcherStrategy)) {
    errors.push(`PATTERN_LEARNING_MATCHER_STRATEGY: Invalid value "${matcherStrategy}". Must be semantic, structural, or hybrid.`);
  }
  
  // Validate read preference
  const readPreference = process.env.DB_READ_PREFERENCE || 'primaryPreferred';
  if (!['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'].includes(readPreference)) {
    errors.push(`DB_READ_PREFERENCE: Invalid value "${readPreference}". Must be primary, primaryPreferred, secondary, secondaryPreferred, or nearest.`);
  }
  
  // Validate read concern level
  const readConcernLevel = process.env.DB_READ_CONCERN_LEVEL || 'majority';
  if (!['local', 'available', 'majority', 'snapshot', 'linearizable'].includes(readConcernLevel)) {
    errors.push(`DB_READ_CONCERN_LEVEL: Invalid value "${readConcernLevel}". Must be local, available, majority, snapshot, or linearizable.`);
  }
  
  // Validate score weights
  const keywordWeight = parseFloatEnv(process.env.SCORE_KEYWORD_WEIGHT, 0.4);
  const semanticWeight = parseFloatEnv(process.env.SCORE_SEMANTIC_WEIGHT, 0.6);
  if (keywordWeight < 0 || keywordWeight > 1) {
    errors.push(`SCORE_KEYWORD_WEIGHT: Invalid value "${process.env.SCORE_KEYWORD_WEIGHT}". Must be between 0 and 1.`);
  }
  if (semanticWeight < 0 || semanticWeight > 1) {
    errors.push(`SCORE_SEMANTIC_WEIGHT: Invalid value "${process.env.SCORE_SEMANTIC_WEIGHT}". Must be between 0 and 1.`);
  }

  // Validate ML Scoring
  const mlScoringEnabled = parseBooleanEnv(process.env.ML_SCORING_ENABLED, false);
  const mlScoringTimeout = parseNumericEnv(process.env.ML_SCORING_TIMEOUT_MS, 5000);

  if (mlScoringTimeout < 1) {
    errors.push(`ML_SCORING_TIMEOUT_MS: Invalid value "${process.env.ML_SCORING_TIMEOUT_MS}". Must be greater than 0.`);
  }

  // Validate Vector Service
  const vectorServiceDevice = process.env.VECTOR_SERVICE_DEVICE;
  if (vectorServiceDevice && !['cpu', 'gpu', 'webgpu'].includes(vectorServiceDevice)) {
    errors.push(`VECTOR_SERVICE_DEVICE: Invalid value "${vectorServiceDevice}". Must be cpu, gpu, or webgpu.`);
  }

  // Validate Graph Structure Schedule
  const graphStructureBuildHour = parseNumericEnv(process.env.GRAPH_STRUCTURE_BUILD_HOUR, 2);
  if (graphStructureBuildHour < 0 || graphStructureBuildHour > 23) {
    errors.push(`GRAPH_STRUCTURE_BUILD_HOUR: Invalid value "${process.env.GRAPH_STRUCTURE_BUILD_HOUR}". Must be between 0 and 23.`);
  }

  const graphStructureBuildStrategy = process.env.GRAPH_STRUCTURE_BUILD_STRATEGY || 'hierarchical';
  if (!['hierarchical', 'semantic', 'clustered'].includes(graphStructureBuildStrategy)) {
    errors.push(`GRAPH_STRUCTURE_BUILD_STRATEGY: Invalid value "${graphStructureBuildStrategy}". Must be hierarchical, semantic, or clustered.`);
  }
  // Validate Ollama / Local LLM
  const ollamaApiUrl = process.env.RERANKER_LOCAL_API_URL || process.env.OLLAMA_API_URL || 'http://localhost:11434';
  const ollamaTimeout = parseNumericEnv(process.env.RERANKER_LOCAL_TIMEOUT || process.env.OLLAMA_TIMEOUT, 30000);

  // Validate FRONTEND_URL
  // Security: FRONTEND_URL is used to build password reset links.
  // In production, it must be explicitly set to prevent broken localhost links in emails.
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  if (nodeEnv === 'production' && (!process.env.FRONTEND_URL || process.env.FRONTEND_URL === 'http://localhost:5173')) {
    errors.push('FRONTEND_URL: Must be explicitly set to a non-localhost URL in production. Password reset emails will contain broken links otherwise.');
  }

  // Validate PostgreSQL Password
  if (!process.env.POSTGRES_PASSWORD) {
    errors.push('POSTGRES_PASSWORD: Environment variable is required.');
  }
  
  // If there are validation errors, throw
  if (errors.length > 0) {
    throw new Error(
      `Environment variable validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}\n\n` +
      `Please check your .env file or environment variables.`
    );
  }
  
  // Build validated env object
  validatedEnv = {
    // Server Configuration
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    PORT: port,

    // Security Configuration
    JWT_SECRET: jwtSecret!,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    JURISDICTIONS_SECRET: jurisdictionsSecret!,
    
    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI,
    DB_NAME: process.env.DB_NAME || 'beleidsscan',
    DB_MAX_RETRIES: parseNumericEnv(process.env.DB_MAX_RETRIES, 3),
    DB_INITIAL_RETRY_DELAY: parseNumericEnv(process.env.DB_INITIAL_RETRY_DELAY, 1000),
    DB_MAX_RETRY_DELAY: parseNumericEnv(process.env.DB_MAX_RETRY_DELAY, 10000),
    DB_MAX_POOL_SIZE: maxPoolSize,
    DB_MIN_POOL_SIZE: minPoolSize,
    DB_MAX_IDLE_TIME_MS: parseNumericEnv(process.env.DB_MAX_IDLE_TIME_MS, 30000),
    DB_MAX_CONNECTION_LIFETIME_MS: parseNumericEnv(process.env.DB_MAX_CONNECTION_LIFETIME_MS, 3600000), // 1 hour
    DB_CONNECT_TIMEOUT_MS: parseNumericEnv(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
    DB_SERVER_SELECTION_TIMEOUT_MS: parseNumericEnv(process.env.DB_SERVER_SELECTION_TIMEOUT_MS, 5000),
    DB_HEALTH_CHECK_INTERVAL: parseNumericEnv(process.env.DB_HEALTH_CHECK_INTERVAL, 30000),
    DB_RECONNECTION_MAX_RETRIES: parseNumericEnv(process.env.DB_RECONNECTION_MAX_RETRIES, 5),
    MONGODB_LOG_POOL_EVENTS: parseBooleanEnv(process.env.MONGODB_LOG_POOL_EVENTS, false),
    DB_READ_PREFERENCE: readPreference as 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest',
    DB_READ_CONCERN_LEVEL: readConcernLevel as 'local' | 'available' | 'majority' | 'snapshot' | 'linearizable',
    DB_WRITE_CONCERN_W: (process.env.DB_WRITE_CONCERN_W || 'majority') as 'majority' | number | string,
    
    // Neo4j Configuration
    NEO4J_URI: process.env.NEO4J_URI,
    NEO4J_USER: process.env.NEO4J_USER || 'neo4j',
    NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'password',
    NEO4J_MAX_CONNECTION_LIFETIME_MS: parseNumericEnv(process.env.NEO4J_MAX_CONNECTION_LIFETIME_MS, 3 * 60 * 60 * 1000), // 3 hours
    NEO4J_MAX_POOL_SIZE: neo4jPoolSize,
    NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS: parseNumericEnv(process.env.NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS, 2 * 60 * 1000), // 2 minutes
    NEO4J_HEALTH_CHECK_INTERVAL_MS: parseNumericEnv(process.env.NEO4J_HEALTH_CHECK_INTERVAL_MS, 30000), // 30 seconds
    
    // GraphDB Configuration - Enforced containerization: must use Docker service name
    // Normalize GraphDB hostname: if GRAPHDB_HOST is set to "graphdb" but we're not in Docker,
    // normalize to localhost (similar to Redis normalization)
    GRAPHDB_HOST: (() => {
      const envHost = process.env.GRAPHDB_HOST;
      if (envHost) {
        if (envHost === 'graphdb' && !isRunningInDocker()) {
          return 'localhost';
        }
        return envHost;
      }
      return getServiceHostnameStrict('graphdb');
    })(),
    GRAPHDB_PORT: parseNumericEnv(process.env.GRAPHDB_PORT, 7200),
    GRAPHDB_LICENSE_PATH: process.env.GRAPHDB_LICENSE_PATH,
    GRAPHDB_HEALTH_CHECK_INTERVAL_MS: parseNumericEnv(process.env.GRAPHDB_HEALTH_CHECK_INTERVAL_MS, 60000), // 60 seconds
    
    // Redis Configuration - Enforced containerization: must use Docker service name
    // REDIS_PORT defaults to 6379 (matches Docker container port and exposed port)
    // Normalize Redis hostname: if REDIS_HOST is set to "redis" but we're not in Docker,
    // normalize to localhost (evaluated in validateEnv() function, not IIFE, to ensure dotenv is loaded)
    REDIS_HOST: (() => {
      const envHost = process.env.REDIS_HOST;
      const isDocker = isRunningInDocker();
      // Normalize Redis hostname: if REDIS_HOST is set to "redis" but we're not in Docker,
      // normalize to localhost (evaluated when validateEnv() is called, ensuring dotenv is loaded)
      if (envHost) {
        if (envHost === 'redis' && !isDocker) {
          // Always use localhost when REDIS_HOST=redis and we're not in Docker
          // This assumes Redis is running as a Docker container with exposed port (6379)
          return 'localhost';
        }
        return envHost;
      }
      // If not set, use getServiceHostnameStrict to determine correct hostname
      return getServiceHostnameStrict('redis');
    })(),
    REDIS_PORT: parseNumericEnv(process.env.REDIS_PORT, 6379),
    REDIS_CONNECTION_MODE: (process.env.REDIS_CONNECTION_MODE || 'single') as 'single' | 'cluster' | 'sentinel',
    REDIS_MAX_RETRIES_PER_REQUEST: parseNumericEnv(process.env.REDIS_MAX_RETRIES_PER_REQUEST, 3),
    REDIS_CONNECT_TIMEOUT: parseNumericEnv(process.env.REDIS_CONNECT_TIMEOUT, 10000), // 10 seconds
    REDIS_COMMAND_TIMEOUT: parseNumericEnv(process.env.REDIS_COMMAND_TIMEOUT, 5000), // 5 seconds
    REDIS_KEEP_ALIVE: parseNumericEnv(process.env.REDIS_KEEP_ALIVE, 30000), // 30 seconds
    REDIS_POOL_SIZE: parseNumericEnv(process.env.REDIS_POOL_SIZE, 1), // Default: 1 (single connection, backward compatible)
    
    // PostgreSQL Configuration - Enforced containerization: must use Docker service name
    POSTGRES_USER: process.env.POSTGRES_USER || 'postgres',
     
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD!,
    POSTGRES_DB: process.env.POSTGRES_DB || 'beleidsscan',
    // Normalize PostgreSQL hostname: if POSTGRES_HOST is set to "postgres" but we're not in Docker,
    // normalize to localhost (similar to Redis normalization)
    POSTGRES_HOST: (() => {
      const envHost = process.env.POSTGRES_HOST;
      if (envHost) {
        if (envHost === 'postgres' && !isRunningInDocker()) {
          return 'localhost';
        }
        return envHost;
      }
      return getServiceHostnameStrict('postgres');
    })(),
    POSTGRES_PORT: parseNumericEnv(process.env.POSTGRES_PORT, 5432),
    
    // pgvector Configuration
    PGVECTOR_SCHEMA: process.env.PGVECTOR_SCHEMA || 'vector',
    PGVECTOR_INDEX_TYPE: (process.env.PGVECTOR_INDEX_TYPE || 'hnsw') as 'hnsw' | 'ivfflat',
    PGVECTOR_HNSW_M: parseNumericEnv(process.env.PGVECTOR_HNSW_M, 16),
    PGVECTOR_HNSW_EF_CONSTRUCTION: parseNumericEnv(process.env.PGVECTOR_HNSW_EF_CONSTRUCTION, 64),
    PGVECTOR_IVFFLAT_LISTS: parseNumericEnv(process.env.PGVECTOR_IVFFLAT_LISTS, 100),
    
    // API Keys
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    GEMINI_TIMEOUT: parseNumericEnv(process.env.GEMINI_TIMEOUT, 300000), // 5 minutes
    GOOGLE_CUSTOM_SEARCH_JSON_API_KEY: process.env.GOOGLE_CUSTOM_SEARCH_JSON_API_KEY,
    GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID: process.env.GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID,
    
    // Environment Mode
    ENVIRONMENT: environment as 'production' | 'preproduction',
    
    // CORS Configuration
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    
    // Frontend Configuration
    FRONTEND_URL: frontendUrl,
    VITE_API_URL: process.env.VITE_API_URL,
    VITE_FORCE_OPTIMIZE: parseBooleanEnv(process.env.VITE_FORCE_OPTIMIZE, false),
    
    // Logging Configuration
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_PRETTY: process.env.LOG_PRETTY,
    LOG_REQUESTS: process.env.LOG_REQUESTS,
    LOG_STACK_TRACES: process.env.LOG_STACK_TRACES,
    
    // Feature Flags
    VIDEO_CLEANUP_ENABLED: parseBooleanEnv(process.env.VIDEO_CLEANUP_ENABLED, false),
    REVIEW_AUTOMATION_ENABLED: parseBooleanEnv(process.env.REVIEW_AUTOMATION_ENABLED, true),
    CACHE_REDIS_ENABLED: parseBooleanEnv(process.env.CACHE_REDIS_ENABLED, true),
    // Website Suggestions Mode: false = production (real API only), true = development (allows mock fallback)
    // In production, this is ALWAYS false (cannot be overridden)
    // In non-production, defaults to true but can be overridden via env var
    USE_MOCK_WEBSITE_SUGGESTIONS: (() => {
      // Force false in production, regardless of env var
      if (nodeEnv === 'production') {
        return false;
      }
      // In non-production, allow env var override, default to true
      const envValue = process.env.USE_MOCK_WEBSITE_SUGGESTIONS;
      if (envValue !== undefined) {
        return parseBooleanEnv(envValue, true);
      }
      return true;
    })(),
    
    // Docker Detection
    DOCKER_CONTAINER: process.env.DOCKER_CONTAINER,
    HOSTNAME: process.env.HOSTNAME,
    
    // Pattern Learning Configuration
    PATTERN_LEARNING_ENABLED: parseBooleanEnv(process.env.PATTERN_LEARNING_ENABLED, true),
    PATTERN_LEARNING_MIN_CONFIDENCE: parseFloatEnv(process.env.PATTERN_LEARNING_MIN_CONFIDENCE, 0.6),
    PATTERN_LEARNING_MIN_MATCH_SCORE: parseFloatEnv(process.env.PATTERN_LEARNING_MIN_MATCH_SCORE, 0.5),
    PATTERN_LEARNING_DEPRECATION_THRESHOLD: parseFloatEnv(process.env.PATTERN_LEARNING_DEPRECATION_THRESHOLD, 0.3),
    PATTERN_LEARNING_AUTO_DEPRECATE_AFTER_FAILURES: parseNumericEnv(process.env.PATTERN_LEARNING_AUTO_DEPRECATE_AFTER_FAILURES, 5),
    PATTERN_LEARNING_MATCHER_STRATEGY: matcherStrategy as 'semantic' | 'structural' | 'hybrid',
    
    // Score Weights
    SCORE_KEYWORD_WEIGHT: keywordWeight,
    SCORE_SEMANTIC_WEIGHT: semanticWeight,
    
    // ML Scoring Configuration
    ML_SCORING_ENABLED: mlScoringEnabled,
    ML_SCORING_SERVICE_URL: process.env.ML_SCORING_SERVICE_URL,
    ML_SCORING_TIMEOUT_MS: mlScoringTimeout,

    // Vector Service Configuration
    VECTOR_SERVICE_DEVICE: vectorServiceDevice as 'cpu' | 'gpu' | 'webgpu' | undefined,
    VECTOR_SERVICE_USE_GPU: parseBooleanEnv(process.env.VECTOR_SERVICE_USE_GPU, false),
    VECTOR_SERVICE_MODEL: process.env.VECTOR_SERVICE_MODEL,

    // Workflow Configuration
    WORKFLOW_STEP_DEFAULT_TIMEOUT_MS: parseNumericEnv(process.env.WORKFLOW_STEP_DEFAULT_TIMEOUT_MS, 5 * 60 * 1000), // Default: 5 minutes
    RUN_TIMEOUT_MS: parseNumericEnv(process.env.RUN_TIMEOUT_MS, 60 * 60 * 1000), // Default: 1 hour
    CRAWLER_ALLOWED_DOMAINS: process.env.CRAWLER_ALLOWED_DOMAINS,

    // Graph Structure Schedule Configuration
    GRAPH_STRUCTURE_BUILD_ENABLED: parseBooleanEnv(process.env.GRAPH_STRUCTURE_BUILD_ENABLED, true),
    GRAPH_STRUCTURE_BUILD_HOUR: graphStructureBuildHour,
    GRAPH_STRUCTURE_BUILD_STRATEGY: graphStructureBuildStrategy as 'hierarchical' | 'semantic' | 'clustered',
    GRAPH_STRUCTURE_BUILD_MAX_DEPTH: parseNumericEnv(process.env.GRAPH_STRUCTURE_BUILD_MAX_DEPTH, 3),
    GRAPH_STRUCTURE_BUILD_MIN_GROUP_SIZE: parseNumericEnv(process.env.GRAPH_STRUCTURE_BUILD_MIN_GROUP_SIZE, 2),

    // KOOP SRU Configuration
    KOOP_SRU_BASE_URL: process.env.KOOP_SRU_BASE_URL,
    KOOP_SRU_CONNECTION_BWB: process.env.KOOP_SRU_CONNECTION_BWB,
    KOOP_SRU_CONNECTION_CVDR: process.env.KOOP_SRU_CONNECTION_CVDR,
    KOOP_SRU_MAX_RECORDS: parseNumericEnv(process.env.KOOP_SRU_MAX_RECORDS, 50),
    KOOP_SRU_RATE_LIMIT_QPS: parseNumericEnv(process.env.KOOP_SRU_RATE_LIMIT_QPS, 5),

    // Ollama / Local LLM Configuration
    OLLAMA_API_URL: ollamaApiUrl,
    RERANKER_MODEL: process.env.RERANKER_MODEL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    OLLAMA_TIMEOUT: ollamaTimeout,

    // Admin Configuration
    // ADMIN_EMAIL and ADMIN_PASSWORD are purposely excluded from shared config
    // to prevent exposure. They should be read directly from process.env in scripts.
  };
  
  return validatedEnv;
}

/**
 * Get validated environment variables
 * Validates on first call, then returns cached result
 */
export function getEnv(): Env {
  return validateEnv();
}

/**
 * Reset validated environment cache
 * Used for testing to allow re-validation after env vars change
 */
export function resetEnv(): void {
  validatedEnv = null;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return getEnv().NODE_ENV === 'test';
}

