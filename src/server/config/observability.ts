/**
 * Observability configuration
 */
export interface ObservabilityConfig {
  metrics: {
    enabled: boolean;
    endpoint: string;
  };
  tracing: {
    enabled: boolean;
    serviceName: string;
    serviceVersion: string;
  };
}

/**
 * Get observability configuration from environment variables
 */
export function getObservabilityConfig(): ObservabilityConfig {
  return {
    metrics: {
      enabled: process.env.ENABLE_METRICS !== 'false', // Enabled by default
      endpoint: process.env.METRICS_ENDPOINT || '/metrics',
    },
    tracing: {
      enabled: process.env.ENABLE_TRACING !== 'false', // Enabled by default
      serviceName: process.env.SERVICE_NAME || 'beleidsscan-api',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
    },
  };
}

