#!/usr/bin/env node

/**
 * Health check script for Beleidsscan application
 * Checks if backend, frontend, Redis, MongoDB, Neo4j, and GraphDB are running and healthy
 */

import http from 'http';
import https from 'https';
import net from 'net';
import { MongoClient } from 'mongodb';
import neo4j from 'neo4j-driver';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { hostname } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
dotenv.config({ path: join(rootDir, '.env') });

/**
 * Detect if we're running inside a Docker container
 */
function isRunningInDocker() {
  return (
    existsSync('/.dockerenv') ||
    process.env.DOCKER_CONTAINER === 'true' ||
    (process.env.HOSTNAME && process.env.HOSTNAME !== hostname())
  );
}

/**
 * Check if Docker Compose is available
 */
async function isDockerComposeAvailable() {
  try {
    await execAsync('docker compose version 2>/dev/null || docker-compose --version 2>/dev/null');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Docker container health status
 */
async function getContainerHealth(containerName) {
  try {
    const { stdout } = await execAsync(`docker inspect --format='{{.State.Health.Status}}' ${containerName} 2>/dev/null || echo "none"`);
    const status = stdout.trim();
    return status === 'healthy' || status === 'starting' || status === 'none' ? status : 'unhealthy';
  } catch {
    return 'unknown';
  }
}

/**
 * Check if Docker container is running
 */
async function isContainerRunning(containerName) {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${containerName}" --format "{{.Names}}" 2>/dev/null`);
    return stdout.trim() === containerName;
  } catch {
    return false;
  }
}

/**
 * Convert Docker service hostnames to localhost for host-based connections
 */
function convertDockerHostnameToLocalhost(uri) {
  if (!uri) return uri;
  
  // If running in Docker, use the URI as-is
  if (isRunningInDocker()) {
    return uri;
  }
  
  // Convert Docker hostnames to localhost
  // mongodb://admin:password@mongodb:27017/... -> mongodb://admin:password@localhost:27017/...
  // bolt://neo4j:7687 -> bolt://localhost:7687
  return uri
    .replace(/@mongodb:/g, '@localhost:')
    .replace(/mongodb:\/\/mongodb:/g, 'mongodb://localhost:')
    .replace(/bolt:\/\/neo4j:/g, 'bolt://localhost:')
    .replace(/redis:/g, 'localhost:');
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function checkEndpoint(url, name, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await new Promise((resolve) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        // Security: Only disable certificate validation in development or when explicitly allowed
        // In production, this should be true to prevent MITM attacks
        const allowSelfSigned = process.env.ALLOW_SELF_SIGNED_CERTS === 'true' || 
                                process.env.NODE_ENV === 'development';
        
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname,
          method: 'GET',
          timeout: 8000, // Increased timeout
          rejectUnauthorized: !allowSelfSigned, // Only allow self-signed in dev or when explicitly enabled
        };

        const req = httpModule.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve({ name, status: 'healthy', url, statusCode: res.statusCode, data });
            } else {
              resolve({ name, status: 'unhealthy', url, statusCode: res.statusCode, data });
            }
          });
        });

        req.on('error', (error) => {
          resolve({ name, status: 'error', url, error: error.message });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ name, status: 'timeout', url });
        });

        req.end();
      });

      // If successful, return immediately
      if (result.status === 'healthy') {
        if (attempt > 1) {
          console.log(`${colors.green}✓${colors.reset} ${name} is healthy (${url}) [attempt ${attempt}/${retries}]`);
        } else {
          console.log(`${colors.green}✓${colors.reset} ${name} is healthy (${url})`);
        }
        return result;
      }

      // If unhealthy but got a response, log and return
      if (result.status === 'unhealthy') {
        console.log(`${colors.yellow}⚠${colors.reset} ${name} returned status ${result.statusCode} (${url})`);
        return result;
      }

      // If error or timeout and not last attempt, wait and retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
        continue;
      }

      // Last attempt failed
      if (result.status === 'timeout') {
        console.log(`${colors.red}✗${colors.reset} ${name} timed out (${url}) [${retries} attempts]`);
      } else {
        console.log(`${colors.red}✗${colors.reset} ${name} is not responding (${url})`);
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }
      }
      return result;
    } catch (error) {
      if (attempt === retries) {
        console.log(`${colors.red}✗${colors.reset} ${name} check failed (${url})`);
        console.log(`  Error: ${error.message}`);
        return { name, status: 'error', url, error: error.message };
      }
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

/**
 * Check Redis health by attempting to connect
 */
async function checkRedisHealth() {
  let redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPortStr = process.env.REDIS_PORT;
  const inDocker = isRunningInDocker();
  
  // Convert Docker hostname to localhost if running on host
  if (!inDocker && (redisHost === 'redis' || redisHost.includes('redis'))) {
    redisHost = 'localhost';
  }
  
  // Port handling: Use the port from environment or default
  // Redis is NOT exposed on host by default (security), so if running on host and port not set, skip check
  // If REDIS_PORT is explicitly set, use it
  // If not set, default to 6379 for Docker
  const redisPort = redisPortStr ? parseInt(redisPortStr, 10) : (inDocker ? 6379 : null);
  
  // If running on host (not in Docker) and port is 6379 (default Docker port), Redis is likely not exposed
  // Return a warning status instead of trying to connect
  if (!inDocker && redisPort === 6379) {
    return { status: 'warning', host: redisHost, port: null, message: 'Redis not exposed on host (security - port 6379 is Docker internal)' };
  }
  
  // If running on host and no port specified, Redis is likely not exposed (security)
  if (!inDocker && !redisPortStr) {
    return { status: 'warning', host: redisHost, port: null, message: 'Redis not exposed on host (security)' };
  }
  
  if (redisPort === null || isNaN(redisPort) || redisPort < 1 || redisPort > 65535) {
    return { status: 'warning', host: redisHost, port: null, message: 'Redis port not configured' };
  }
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    
    const resolveOnce = (value) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(value);
      }
    };
    
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      // Try to send PING command
      socket.write('PING\r\n');
    });
    
    socket.on('data', (data) => {
      // Redis responds with +PONG to PING
      if (data.toString().includes('PONG') || data.toString().includes('+PONG')) {
        resolveOnce({ status: 'healthy', host: redisHost, port: redisPort });
      } else {
        // Any response means Redis is running
        resolveOnce({ status: 'healthy', host: redisHost, port: redisPort });
      }
    });
    
    socket.on('error', () => {
      resolveOnce({ status: 'error', host: redisHost, port: redisPort });
    });
    
    socket.on('timeout', () => {
      resolveOnce({ status: 'timeout', host: redisHost, port: redisPort });
    });
    
    try {
      socket.connect(redisPort, redisHost);
    } catch {
      resolveOnce({ status: 'error', host: redisHost, port: redisPort });
    }
    
    // Fallback timeout
    setTimeout(() => {
      resolveOnce({ status: 'timeout', host: redisHost, port: redisPort });
    }, 3000);
  });
}

/**
 * Encode MongoDB connection string to handle special characters in passwords
 * Properly URL-encodes username and password components
 */
function encodeMongoUri(uri) {
  try {
    // Parse the URI to extract components
    const url = new URL(uri);
    
    // Encode username and password if they contain special characters
    if (url.username) {
      url.username = encodeURIComponent(url.username);
    }
    if (url.password) {
      url.password = encodeURIComponent(url.password);
    }
    
    return url.toString();
  } catch (_error) {
    // If URL parsing fails, try manual encoding of password
    // Pattern: mongodb://username:password@host:port/database?options
    const match = uri.match(/^mongodb:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      const [, username, password, rest] = match;
      const encodedUsername = encodeURIComponent(username);
      const encodedPassword = encodeURIComponent(password);
      return `mongodb://${encodedUsername}:${encodedPassword}@${rest}`;
    }
    // If no match, return as-is (might be malformed, but let MongoDB driver handle it)
    return uri;
  }
}

/**
 * Check MongoDB health by attempting to connect
 */
async function checkMongoDBHealth() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is required. Please set it in your .env file.');
  }
  
  // Convert Docker hostname to localhost if running on host
  let connectionUri = convertDockerHostnameToLocalhost(mongoUri);
  
  // Always encode URI to handle special characters in passwords
  // Passwords may contain special characters like /, =, @, etc. that need URL encoding
  // The encodeMongoUri function safely handles encoding (won't double-encode)
  connectionUri = encodeMongoUri(connectionUri);
  
  let client = null;
  try {
    client = new MongoClient(connectionUri, {
      serverSelectionTimeoutMS: 5000,  // Increased timeout
      connectTimeoutMS: 5000,          // Increased timeout
      socketTimeoutMS: 5000,
    });
    
    await client.connect();
    await client.db().admin().ping();
    await client.close();
    
    return { status: 'healthy', uri: mongoUri.replace(/:[^:@]+@/, ':****@') };
  } catch (error) {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
    // Provide more helpful error messages
    const errorMessage = error instanceof Error ? error.message : String(error);
    const sanitizedError = errorMessage.includes('Authentication failed') 
      ? 'Authentication failed - check MongoDB credentials'
      : errorMessage;
    
    return { 
      status: 'error', 
      uri: mongoUri.replace(/:[^:@]+@/, ':****@'),
      error: sanitizedError
    };
  }
}

/**
 * Check Neo4j health by attempting to connect
 */
async function checkNeo4jHealth() {
  const uri = process.env.NEO4J_URI;
  if (!uri) {
    throw new Error('NEO4J_URI environment variable is required. Please set it in your .env file.');
  }
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';
  
  // Security warning for default password (only in non-test environments)
  if (password === 'password' && process.env.NODE_ENV !== 'test' && !process.env.CI) {
    console.log(`${colors.yellow}⚠ Warning: Using default Neo4j password. For secure setup, run: pnpm run setup:neo4j-password${colors.reset}`);
  }
  
  // Convert Docker hostname to localhost if running on host
  const connectionUri = convertDockerHostnameToLocalhost(uri);
  
  let driver = null;
  try {
    driver = neo4j.driver(connectionUri, neo4j.auth.basic(user, password), {
      connectionTimeout: 3000,
      maxConnectionLifetime: 3 * 60 * 60 * 1000,
    });
    
    await driver.verifyConnectivity();
    await driver.close();
    
    return { status: 'healthy', uri: uri.replace(/:[^:@]+@/, ':****@') };
  } catch (error) {
    if (driver) {
      try {
        await driver.close();
      } catch {
        // Ignore close errors
      }
    }
    return { 
      status: 'error', 
      uri: uri.replace(/:[^:@]+@/, ':****@'),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check GraphDB health by attempting to connect and verify repository exists
 */
async function checkGraphDBHealth() {
  const host = process.env.GRAPHDB_HOST || 'localhost';
  const port = process.env.GRAPHDB_PORT || '7200';
  const repository = process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG';
  const username = process.env.GRAPHDB_USER || 'admin';
  const password = process.env.GRAPHDB_PASSWORD || 'root';
  const baseUrl = `http://${host}:${port}`;
  const restEndpoint = `${baseUrl}/rest/repositories`;
  const queryEndpoint = `${baseUrl}/repositories/${repository}`;
  
  try {
    // First check if GraphDB server is accessible
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const reposResponse = await fetch(restEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
      },
      signal: AbortSignal.timeout(3000),
    });
    
    if (!reposResponse.ok) {
      return { 
        status: 'error', 
        url: baseUrl,
        error: `HTTP ${reposResponse.status}: ${reposResponse.statusText}`
      };
    }
    
    // Check if the expected repository exists
    const repos = await reposResponse.json();
    const repoExists = Array.isArray(repos) && repos.some((repo) => repo.id === repository);
    
    if (!repoExists) {
      return { 
        status: 'error', 
        url: baseUrl,
        error: `Repository "${repository}" not found. Available repositories: ${repos.map(r => r.id).join(', ') || 'none'}`
      };
    }
    
    // Test query to verify repository is accessible
    // Note: GraphDB Free edition may have license limitations, so we check if server is accessible
    // rather than requiring successful queries
    const queryResponse = await fetch(queryEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
        'Authorization': authHeader,
      },
      body: 'SELECT ?s WHERE { ?s ?p ?o } LIMIT 1',
      signal: AbortSignal.timeout(3000),
    });
    
    if (queryResponse.ok) {
      return { status: 'healthy', url: baseUrl, repository };
    } else {
      const errorText = await queryResponse.text();
      // If repository exists and server is accessible, consider it healthy even if queries fail
      // (GraphDB Free may have license limitations)
      if (repoExists && (queryResponse.status === 500 && (errorText.includes('License') || errorText.includes('No license')))) {
        return { 
          status: 'warning', 
          url: baseUrl,
          repository,
          error: `GraphDB is running but requires a license for queries. Repository exists and is accessible. This is expected with GraphDB Free edition - application will use Neo4j as fallback.`
        };
      }
      return { 
        status: 'error', 
        url: baseUrl,
        repository,
        error: `Repository query failed: HTTP ${queryResponse.status}: ${errorText.substring(0, 100)}`
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
      return { 
        status: 'error', 
        url: baseUrl,
        error: `Connection refused: ${errorMessage}`
      };
    }
    return { 
      status: 'error', 
      url: baseUrl,
      error: errorMessage
    };
  }
}

/**
 * Check file descriptor limit for frontend container (critical for esbuild)
 */
async function checkFileDescriptorLimit() {
  if (!isRunningInDocker()) {
    // Only check in Docker containers
    return null;
  }
  
  try {
    const { stdout } = await execAsync('ulimit -n 2>/dev/null || echo "unknown"');
    const limit = parseInt(stdout.trim(), 10);
    
    if (isNaN(limit)) {
      return { status: 'unknown', limit: 'unknown', message: 'Could not determine file descriptor limit' };
    }
    
    // Minimum recommended limit for esbuild is 4096, optimal is 8192
    if (limit < 4096) {
      return {
        status: 'error',
        limit,
        message: `File descriptor limit (${limit}) is too low. Minimum: 4096, Recommended: 8192. This will cause esbuild EPIPE errors. See docs/21-issues/ESBUILD-EPIPE-ROOT-CAUSE.md`,
      };
    } else if (limit < 8192) {
      return {
        status: 'warning',
        limit,
        message: `File descriptor limit (${limit}) is below recommended (8192). May cause issues with large projects.`,
      };
    } else {
      return {
        status: 'healthy',
        limit,
        message: `File descriptor limit (${limit}) is adequate`,
      };
    }
  } catch {
    return null; // Skip check if ulimit not available
  }
}

async function runHealthCheck() {
  console.log(`${colors.blue}═══════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}    Beleidsscan Health Check${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════${colors.reset}\n`);

  // Check if Docker Compose is available and containers are running
  const dockerComposeAvailable = await isDockerComposeAvailable();
  const useDocker = dockerComposeAvailable && !isRunningInDocker();
  
  if (useDocker) {
    console.log(`${colors.cyan}Checking Docker container status...${colors.reset}\n`);
    
    const containers = [
      { name: 'beleidsscan-backend', service: 'Backend API' },
      { name: 'beleidsscan-frontend', service: 'Frontend Dev Server' },
      { name: 'beleidsscan-mongodb', service: 'MongoDB' },
      { name: 'beleidsscan-neo4j', service: 'Neo4j' },
      { name: 'beleidsscan-redis', service: 'Redis' },
      { name: 'beleidsscan-graphdb', service: 'GraphDB' },
    ];
    
    for (const container of containers) {
      const isRunning = await isContainerRunning(container.name);
      const health = await getContainerHealth(container.name);
      
      if (isRunning) {
        if (health === 'healthy' || health === 'none') {
          console.log(`${colors.green}✓${colors.reset} ${container.service} container is running (${container.name})`);
        } else if (health === 'starting') {
          console.log(`${colors.yellow}⚠${colors.reset} ${container.service} container is starting (${container.name})`);
        } else {
          console.log(`${colors.red}✗${colors.reset} ${container.service} container is unhealthy (${container.name})`);
        }
      } else {
        console.log(`${colors.red}✗${colors.reset} ${container.service} container is not running (${container.name})`);
      }
    }
    
    console.log('');
  }

  const backendPort = process.env.PORT || '4000';
  const frontendPort = process.env.VITE_PORT || '5173';
  
  const checks = [
    { url: `http://localhost:${backendPort}/health`, name: 'Backend API' },
    { url: `http://localhost:${frontendPort}`, name: 'Frontend Dev Server' },
  ];

  console.log(`${colors.yellow}Checking HTTP services (with retries)...${colors.reset}\n`);

  const httpResults = await Promise.all(
    checks.map(async ({ url, name, fallbackUrl }) => {
      const result = await checkEndpoint(url, name, 3);
      // If primary URL failed and we have a fallback, try it
      if (result.status !== 'healthy' && fallbackUrl) {
        const fallbackResult = await checkEndpoint(fallbackUrl, name, 2);
        return fallbackResult.status === 'healthy' ? fallbackResult : result;
      }
      return result;
    })
  );
  
  console.log(`\n${colors.yellow}Checking database services...${colors.reset}\n`);
  
  // Check Redis
  const redisResult = await checkRedisHealth();
  const redisFormatted = {
    name: redisResult.port ? `Redis (${redisResult.host}:${redisResult.port})` : `Redis (${redisResult.host})`,
    status: redisResult.status,
    url: redisResult.port ? `${redisResult.host}:${redisResult.port}` : redisResult.host,
  };
  
  if (redisResult.status === 'healthy') {
    console.log(`${colors.green}✓${colors.reset} ${redisFormatted.name} is healthy`);
  } else if (redisResult.status === 'warning') {
    console.log(`${colors.yellow}⚠${colors.reset} ${redisFormatted.name}: ${redisResult.message || 'not exposed on host (security)'}`);
  } else if (redisResult.status === 'timeout') {
    console.log(`${colors.red}✗${colors.reset} ${redisFormatted.name} timed out`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} ${redisFormatted.name} is not responding`);
  }
  
  // Check MongoDB
  const mongoResult = await checkMongoDBHealth();
  const mongoFormatted = {
    name: 'MongoDB',
    status: mongoResult.status,
    url: mongoResult.uri,
    error: mongoResult.error,
  };
  
  if (mongoResult.status === 'healthy') {
    console.log(`${colors.green}✓${colors.reset} ${mongoFormatted.name} is healthy (${mongoResult.uri})`);
  } else {
    console.log(`${colors.red}✗${colors.reset} ${mongoFormatted.name} is not responding (${mongoResult.uri})`);
    if (mongoResult.error) {
      console.log(`  Error: ${mongoResult.error}`);
    }
  }
  
  // Check Neo4j
  const neo4jResult = await checkNeo4jHealth();
  const neo4jFormatted = {
    name: 'Neo4j',
    status: neo4jResult.status,
    url: neo4jResult.uri,
    error: neo4jResult.error,
  };
  
  if (neo4jResult.status === 'healthy') {
    console.log(`${colors.green}✓${colors.reset} ${neo4jFormatted.name} is healthy (${neo4jResult.uri})`);
  } else {
    console.log(`${colors.red}✗${colors.reset} ${neo4jFormatted.name} is not responding (${neo4jResult.uri})`);
    if (neo4jResult.error) {
      console.log(`  Error: ${neo4jResult.error}`);
    }
  }
  
  // Check GraphDB (optional)
  const graphdbResult = await checkGraphDBHealth();
  const graphdbFormatted = {
    name: 'GraphDB',
    status: graphdbResult.status,
    url: graphdbResult.url,
    error: graphdbResult.error,
  };
  
  if (graphdbResult.status === 'healthy') {
    const repoInfo = graphdbResult.repository ? ` (repository: ${graphdbResult.repository})` : '';
    console.log(`${colors.green}✓${colors.reset} ${graphdbFormatted.name} is healthy (${graphdbResult.url}${repoInfo})`);
  } else if (graphdbResult.status === 'warning') {
    // GraphDB is running but has license limitations (GraphDB Free edition)
    const repoInfo = graphdbResult.repository ? ` (repository: ${graphdbResult.repository})` : '';
    console.log(`${colors.yellow}⚠${colors.reset} ${graphdbFormatted.name} is running with limitations (${graphdbResult.url}${repoInfo})`);
    if (graphdbResult.error) {
      console.log(`  Note: ${graphdbResult.error}`);
    }
    console.log(`  Note: GraphDB is optional, application can use Neo4j as fallback`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} ${graphdbFormatted.name} is not responding (${graphdbResult.url})`);
    if (graphdbResult.error) {
      console.log(`  Error: ${graphdbResult.error}`);
    }
    if (graphdbResult.error && graphdbResult.error.includes('Repository')) {
      console.log(`  💡 Create the repository via GraphDB Workbench: ${graphdbResult.url}`);
      console.log(`     Repository ID should be: ${process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG'}`);
    }
    console.log(`  Note: GraphDB is optional, application can use Neo4j as fallback`);
  }
  
  // Check file descriptor limit (critical for frontend/esbuild)
  console.log(`\n${colors.yellow}Checking resource limits...${colors.reset}\n`);
  const fdLimitResult = await checkFileDescriptorLimit();
  if (fdLimitResult) {
    if (fdLimitResult.status === 'healthy') {
      console.log(`${colors.green}✓${colors.reset} File descriptor limit: ${fdLimitResult.limit} (${fdLimitResult.message})`);
    } else if (fdLimitResult.status === 'warning') {
      console.log(`${colors.yellow}⚠${colors.reset} File descriptor limit: ${fdLimitResult.limit} - ${fdLimitResult.message}`);
    } else {
      console.log(`${colors.red}✗${colors.reset} File descriptor limit: ${fdLimitResult.limit} - ${fdLimitResult.message}`);
      console.log(`  Fix: Add ulimits to docker-compose.yml frontend service (see docs/21-issues/ESBUILD-EPIPE-ROOT-CAUSE.md)`);
    }
  }
  
  const results = [...httpResults, redisFormatted, mongoFormatted, neo4jFormatted, graphdbFormatted];

  console.log(`\n${colors.blue}═══════════════════════════════════════════════${colors.reset}`);

  // GraphDB is optional, so exclude it from critical health checks
  // Redis warnings (not exposed on host) are acceptable for security reasons
  // GraphDB warnings (license limitations) are acceptable for GraphDB Free edition
  const criticalServices = results.filter(r => r.name !== 'GraphDB');
  const allCriticalHealthy = criticalServices.every((r) => {
    // Redis warnings about not being exposed on host are acceptable (security feature)
    if (r.name.includes('Redis') && r.status === 'warning') {
      return true;
    }
    return r.status === 'healthy';
  });
  const someUnhealthy = results.some((r) => {
    // Exclude Redis warnings, GraphDB warnings, and GraphDB errors from unhealthy checks
    if (r.name === 'GraphDB' || (r.name.includes('Redis') && r.status === 'warning')) {
      return false;
    }
    return r.status === 'unhealthy' || r.status === 'error';
  });
  
  if (allCriticalHealthy) {
    console.log(`${colors.green}✅ All critical services are healthy!${colors.reset}`);
    console.log(`\n${colors.blue}Backend API:${colors.reset} http://localhost:${backendPort}`);
    console.log(`${colors.blue}Frontend:${colors.reset}    http://localhost:${frontendPort}`);
    let redisDisplayHost = process.env.REDIS_HOST || 'localhost';
    // Convert Docker hostname to localhost if running on host (for display consistency)
    if (!isRunningInDocker() && (redisDisplayHost === 'redis' || redisDisplayHost.includes('redis'))) {
      redisDisplayHost = 'localhost';
    }
    // Always display 6380 for host connections (harmonized port)
    // Inside Docker, this will be overridden by REDIS_PORT env var, but for display we show 6380
    const redisDisplayPort = process.env.REDIS_PORT || '6380';
    // If port is 6379 (container port), convert to 6380 for display when running on host
    const displayPort = (!isRunningInDocker() && redisDisplayPort === '6379') ? '6380' : redisDisplayPort;
    console.log(`${colors.blue}Redis:${colors.reset}      ${redisDisplayHost}:${displayPort}`);
    console.log(`${colors.blue}MongoDB:${colors.reset}    ${mongoResult.uri}`);
    console.log(`${colors.blue}Neo4j:${colors.reset}      ${neo4jResult.uri}`);
    if (graphdbResult.status === 'healthy') {
      const repoInfo = graphdbResult.repository ? ` (${graphdbResult.repository})` : '';
      console.log(`${colors.blue}GraphDB:${colors.reset}    ${graphdbResult.url}${repoInfo}`);
    }
    process.exit(0);
  } else if (someUnhealthy) {
    console.log(`${colors.yellow}⚠️  Some services are responding but may have issues${colors.reset}`);
    results.forEach((r) => {
      if (r.status === 'unhealthy' || (r.status === 'error' && r.name !== 'GraphDB')) {
        if (r.statusCode) {
          console.log(`  ${r.name}: Status ${r.statusCode}`);
        } else if (r.error) {
          console.log(`  ${r.name}: ${r.error}`);
        } else {
          console.log(`  ${r.name}: ${r.status}`);
        }
      }
    });
    console.log(`\n${colors.yellow}Services may need attention${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`${colors.red}❌ Critical services are not healthy${colors.reset}`);
    
    // Provide specific guidance based on what's failing
    // Exclude Redis warnings (not exposed on host) and GraphDB from failed services
    const failedServices = results.filter(r => {
      if (r.name === 'GraphDB') return false;
      if (r.name.includes('Redis') && r.status === 'warning') return false;
      return r.status !== 'healthy';
    });
    const failedServiceNames = failedServices.map(r => r.name).join(', ');
    
    console.log(`\n${colors.yellow}Failed services: ${failedServiceNames}${colors.reset}`);
    
    if (failedServices.some(r => r.name === 'Backend API' || r.name === 'Frontend Dev Server')) {
      console.log(`\n${colors.blue}To start application services:${colors.reset}`);
      console.log(`  pnpm run dev:all`);
      console.log(`\n${colors.blue}Or start services separately:${colors.reset}`);
      console.log(`  Terminal 1: pnpm run dev:backend`);
      console.log(`  Terminal 2: pnpm run dev:frontend`);
    }
    
    if (failedServices.some(r => r.name === 'Redis')) {
      console.log(`\n${colors.blue}To start Redis:${colors.reset}`);
      console.log(`  docker compose up redis -d`);
      console.log(`  Or: redis-server`);
      console.log(`  Or: sudo systemctl start redis`);
      console.log(`  Note: QueueService requires Redis. Cache and rate limiter will use in-memory fallback.`);
    }
    
    if (failedServices.some(r => r.name === 'MongoDB')) {
      console.log(`\n${colors.blue}To start MongoDB:${colors.reset}`);
      console.log(`  docker compose up mongodb -d`);
      console.log(`  Or: mongod (if installed locally)`);
    }
    
    if (failedServices.some(r => r.name === 'Neo4j')) {
      console.log(`\n${colors.blue}Neo4j issues:${colors.reset}`);
      if (neo4jResult.error && neo4jResult.error.includes('authentication')) {
        console.log(`  Authentication failure detected.`);
        console.log(`  Check that NEO4J_PASSWORD in .env matches the Neo4j container password.`);
        console.log(`  To reset Neo4j password (recommended):`);
        console.log(`    pnpm run setup:neo4j-password -- --reset-db`);
        console.log(`  Or manually:`);
        console.log(`    1. Stop Neo4j: docker compose stop neo4j`);
        console.log(`    2. Remove data volume: docker volume rm beleidsscan_neo4j_data`);
        console.log(`    3. Update .env with secure password`);
        console.log(`    4. Start Neo4j: docker compose up -d neo4j`);
      } else {
        console.log(`  To start Neo4j: docker compose up neo4j -d`);
        console.log(`  Or: neo4j start (if installed locally)`);
      }
      console.log(`  Note: Neo4j is required for navigation graph functionality.`);
    }
    
    process.exit(1);
  }
}

// Run the health check
runHealthCheck().catch((error) => {
  console.error(`${colors.red}Health check failed:${colors.reset}`, error);
  process.exit(1);
});
