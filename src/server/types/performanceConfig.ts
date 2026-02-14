/**
 * Performance Configuration Types
 * 
 * Defines types and interfaces for workflow performance configuration,
 * including per-step maxResults caps, timeouts, and hybrid retrieval settings.
 */

/**
 * Performance configuration for a single workflow step
 */
export interface StepPerformanceConfig {
  /** Maximum number of results for this step (default: varies by step) */
  maxResults?: number;
  
  /** Timeout in milliseconds for this step (default: from StepTimeoutConfig) */
  timeout?: number;
  
  /** Enable hybrid retrieval for this step */
  enableHybridRetrieval?: boolean;
  
  /** Weight for hybrid retrieval (0-1, default: 0.5) */
  hybridRetrievalWeight?: number;
  
  /** Enable performance monitoring for this step */
  enableMonitoring?: boolean;
}

/**
 * Performance configuration for an entire workflow run
 */
export interface WorkflowPerformanceConfig {
  // Per-step configuration
  /** Step 1: DSO Discovery */
  step1?: StepPerformanceConfig;
  
  /** Step 2: IPLO Search */
  step2?: StepPerformanceConfig;
  
  /** Step 3: Merge/Score */
  step3?: StepPerformanceConfig;
  
  /** Step 4: Scan Known Sources */
  step4?: StepPerformanceConfig;
  
  /** Step 5: Google Search */
  step5?: StepPerformanceConfig;
  
  /** Step 6: Official Publications */
  step6?: StepPerformanceConfig;
  
  /** Step 7: Jurisprudence */
  step7?: StepPerformanceConfig;
  
  /** Step 8: Common Crawl */
  step8?: StepPerformanceConfig;
  
  // Global defaults
  /** Default maxResults if not specified per step */
  defaultMaxResults?: number;
  
  /** Global timeout for entire workflow in milliseconds */
  globalTimeout?: number;
  
  /** Enable performance metrics collection */
  enablePerformanceMonitoring?: boolean;
  
  /** Hard cap for maxResults (prevents resource exhaustion) */
  hardMaxResultsCap?: number;
}

/**
 * Default performance configuration
 * 
 * Provides sensible defaults for all workflow steps to prevent
 * resource exhaustion while maintaining good performance.
 */
export const DEFAULT_PERFORMANCE_CONFIG: WorkflowPerformanceConfig = {
  defaultMaxResults: 100,
  globalTimeout: 300000, // 5 minutes
  hardMaxResultsCap: 1000, // Hard cap at 1000 results
  enablePerformanceMonitoring: true,
  
  // Per-step defaults
  step1: { 
    maxResults: 50,
    enableHybridRetrieval: false,
    enableMonitoring: true,
  },
  step2: { 
    maxResults: 100,
    enableHybridRetrieval: false,
    enableMonitoring: true,
  },
  step3: { 
    maxResults: 200,
    enableHybridRetrieval: true,
    hybridRetrievalWeight: 0.5,
    enableMonitoring: true,
  },
  step4: { 
    maxResults: 100,
    enableHybridRetrieval: false,
    enableMonitoring: true,
  },
  step5: { 
    maxResults: 50,
    enableHybridRetrieval: false,
    enableMonitoring: true,
  },
  step6: { 
    maxResults: 50,
    enableHybridRetrieval: false,
    enableMonitoring: true,
  },
  step7: { 
    maxResults: 50,
    enableHybridRetrieval: false,
    enableMonitoring: true,
  },
  step8: { 
    maxResults: 100,
    enableHybridRetrieval: false,
    enableMonitoring: true,
  },
};

/**
 * Step identifier for performance configuration
 */
export type StepIdentifier = 
  | 'step1' 
  | 'step2' 
  | 'step3' 
  | 'step4' 
  | 'step5' 
  | 'step6' 
  | 'step7' 
  | 'step8';

/**
 * Merge a partial performance config with defaults
 * 
 * @param config - Partial performance config to merge
 * @param defaults - Default config to merge with (default: DEFAULT_PERFORMANCE_CONFIG)
 * @returns Merged performance config
 */
export function mergePerformanceConfig(
  config: Partial<WorkflowPerformanceConfig>,
  defaults: WorkflowPerformanceConfig = DEFAULT_PERFORMANCE_CONFIG
): WorkflowPerformanceConfig {
  const merged: WorkflowPerformanceConfig = {
    ...defaults,
    ...config,
  };
  
  // Merge per-step configs
  for (const step of ['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7', 'step8'] as StepIdentifier[]) {
    if (config[step]) {
      merged[step] = {
        ...defaults[step],
        ...config[step],
      };
    }
  }
  
  return merged;
}

/**
 * Get performance config for a specific step
 * 
 * @param config - Workflow performance config
 * @param step - Step identifier
 * @returns Step performance config with defaults applied
 */
export function getStepPerformanceConfig(
  config: WorkflowPerformanceConfig,
  step: StepIdentifier
): StepPerformanceConfig {
  const stepConfig = config[step] || {};
  
  return {
    maxResults: stepConfig.maxResults ?? config.defaultMaxResults ?? 100,
    timeout: stepConfig.timeout,
    enableHybridRetrieval: stepConfig.enableHybridRetrieval ?? false,
    hybridRetrievalWeight: stepConfig.hybridRetrievalWeight ?? 0.5,
    enableMonitoring: stepConfig.enableMonitoring ?? config.enablePerformanceMonitoring ?? true,
  };
}

/**
 * Apply maxResults cap to a value
 * 
 * @param requested - Requested maxResults value
 * @param config - Step performance config
 * @param globalConfig - Global workflow performance config
 * @returns Capped maxResults value
 */
export function applyMaxResultsCap(
  requested: number | undefined,
  config: StepPerformanceConfig,
  globalConfig: WorkflowPerformanceConfig
): number {
  const stepMax = config.maxResults ?? globalConfig.defaultMaxResults ?? 100;
  const hardCap = globalConfig.hardMaxResultsCap ?? 1000;
  
  if (requested === undefined) {
    return stepMax;
  }
  
  // Apply step cap, then hard cap
  const capped = Math.min(requested, stepMax, hardCap);
  
  return Math.max(1, capped); // Ensure at least 1
}



