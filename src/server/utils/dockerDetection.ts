import { existsSync } from 'fs';
import { hostname } from 'os';
import { execFileSync } from 'child_process';

/**
 * Detect if the application is running inside a Docker container
 * 
 * Checks multiple indicators:
 * 1. /.dockerenv file exists (most reliable)
 * 2. DOCKER_CONTAINER environment variable is set
 * 3. HOSTNAME differs from system hostname (container hostname)
 * 4. Container-specific environment variables
 * 
 * @returns true if running in Docker, false otherwise
 */
export function isRunningInDocker(): boolean {
  const systemHostname = hostname();
  
  return (
    // Most reliable: Docker creates this file in containers
    existsSync('/.dockerenv') ||
    // Explicit Docker flag
    process.env.DOCKER_CONTAINER === 'true' ||
    // Container hostname differs from system hostname
    (process.env.HOSTNAME && process.env.HOSTNAME !== systemHostname) ||
    // Additional Docker indicators
    !!process.env.DOCKER_BUILDKIT ||
    !!process.env.DOCKER_HOST
  );
}

/**
 * Get Docker service hostname for a service
 * Returns the Docker Compose service name when in Docker, otherwise localhost
 * 
 * @deprecated Use getServiceHostnameStrict() to enforce containerization
 * @param serviceName - Docker Compose service name (e.g., 'neo4j', 'mongodb')
 * @param localhost - Local hostname to use when not in Docker (default: 'localhost')
 * @returns Hostname to use for connection
 */
export function getServiceHostname(serviceName: string, localhost: string = 'localhost'): string {
  if (isRunningInDocker()) {
    return serviceName;
  }
  
  // Warn if trying to run outside Docker
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      `⚠️  Running outside Docker. Service "${serviceName}" will use "${localhost}". ` +
      `For Docker-first setup, run: docker compose up -d ${serviceName}`
    );
  }
  
  return localhost;
}

/**
 * Check if a Docker service is running as a container
 */
export function isDockerServiceRunning(serviceName: string): boolean {
  try {
    const result = execFileSync('docker', ['compose', 'ps', serviceName, '--format', 'json'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    if (!result.trim()) {
      return false;
    }
    const services = JSON.parse(`[${result.trim().split('\n').filter(l => l).join(',')}]`);
    return services.some((s: { State?: string; Name?: string }) => 
      s.State === 'running' || s.State === 'healthy'
    );
  } catch {
    return false;
  }
}

/**
 * Get Docker service hostname for a service (STRICT - enforces containerization)
 * Allows localhost if the service is verified to be a Docker container
 * 
 * Use this function to enforce containerization and prevent localhost fallbacks
 * to non-containerized services.
 * 
 * @param serviceName - Docker Compose service name (e.g., 'neo4j', 'mongodb', 'postgres')
 * @returns Hostname to use for connection (Docker service name or localhost if verified container)
 * @throws Error if not running in Docker and service is not a verified Docker container
 */
export function getServiceHostnameStrict(serviceName: string): string {
  if (isRunningInDocker()) {
    return serviceName;
  }
  
  // Allow test environment to use localhost for unit tests and E2E tests
  if (process.env.NODE_ENV === 'test' || 
      process.env.SKIP_SERVICE_VALIDATION === 'true' || 
      process.env.E2E_TEST === 'true') {
    return 'localhost';
  }
  
  // If environment variable is explicitly set, allow it (user override)
  const envKey = `${serviceName.toUpperCase()}_HOST`;
  if (process.env[envKey]) {
    // Verify it's actually a Docker container if using localhost
    if (process.env[envKey] === 'localhost' && !isDockerServiceRunning(serviceName)) {
      throw new Error(
        `❌ Service "${serviceName}" is not a Docker container. ` +
        `Please ensure it's running: docker compose up -d ${serviceName}`
      );
    }
    return process.env[envKey];
  }
  
  // Check if service is running as Docker container - allow localhost if verified
  if (isDockerServiceRunning(serviceName)) {
    return 'localhost';
  }
  
  throw new Error(
    `❌ Containerization enforced: Service "${serviceName}" requires Docker. ` +
    `The service must be a Docker container. ` +
    `Please run: docker compose up -d ${serviceName} ` +
    `or start all services: docker compose up -d`
  );
}

/**
 * Assert that we're running in Docker, throw error if not
 * Use this for services that MUST run in Docker
 * 
 * @param serviceName - Name of the service that requires Docker
 * @throws Error if not running in Docker
 */
export function assertRunningInDocker(serviceName: string): void {
  if (!isRunningInDocker()) {
    throw new Error(
      `❌ ${serviceName} requires Docker. ` +
      `Please run: docker compose up -d ${serviceName} ` +
      `or start all services: docker compose up -d`
    );
  }
}


