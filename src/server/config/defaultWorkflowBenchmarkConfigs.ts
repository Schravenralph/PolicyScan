/**
 * Default Benchmark Configurations for Predefined Workflows
 * 
 * This file defines default benchmark configurations for all predefined workflows.
 * These defaults are used when a workflow doesn't have a custom benchmark config
 * stored in the database.
 * 
 * Default values are conservative (longer timeouts, more retries) to ensure
 * benchmarks complete successfully. Users can override these via database configs.
 */

import type { WorkflowBenchmarkConfig } from '../models/Workflow.js';

/**
 * Default benchmark configurations for predefined workflows
 * 
 * Timeout guidelines:
 * - Simple searches: 5 minutes (300000ms)
 * - Enrichment/processing: 10 minutes (600000ms)
 * - Complex multi-step: 15 minutes (900000ms)
 * 
 * MaxRetries guidelines:
 * - External API calls: 2-3 retries
 * - Internal operations: 1 retry
 */
export const DEFAULT_WORKFLOW_BENCHMARK_CONFIGS: Record<string, WorkflowBenchmarkConfig> = {
    // Beleidsscan wizard step workflows
    'beleidsscan-step-1-search-dso': {
        featureFlags: {},
        params: {},
        timeout: 300000, // 5 minutes (DSO API can be slow)
        maxRetries: 3,
    },
    'beleidsscan-step-2-enrich-dso': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes (enrichment can take longer)
        maxRetries: 2,
    },
    'beleidsscan-step-3-search-iplo': {
        featureFlags: {},
        params: {},
        timeout: 300000, // 5 minutes
        maxRetries: 3,
    },
    'beleidsscan-step-4-scan-known-sources': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes (multiple sources)
        maxRetries: 2,
    },
    'beleidsscan-step-5-officiele-bekendmakingen': {
        featureFlags: {},
        params: {},
        timeout: 300000, // 5 minutes
        maxRetries: 3,
    },
    'beleidsscan-step-6-rechtspraak': {
        featureFlags: {},
        params: {},
        timeout: 300000, // 5 minutes
        maxRetries: 3,
    },
    'beleidsscan-step-7-common-crawl': {
        featureFlags: {},
        params: {},
        timeout: 900000, // 15 minutes (Common Crawl can be slow)
        maxRetries: 2,
    },
    'beleidsscan-step-9-merge-score': {
        featureFlags: {},
        params: {},
        timeout: 300000, // 5 minutes (scoring operation)
        maxRetries: 1,
    },
    
    // Full wizard workflow
    'beleidsscan-wizard': {
        featureFlags: {},
        params: {},
        timeout: 1800000, // 30 minutes (full wizard execution)
        maxRetries: 1,
    },
    
    // Exploration workflows
    'iplo-exploration': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes
        maxRetries: 2,
    },
    'standard-scan': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes
        maxRetries: 2,
    },
    'quick-iplo-scan': {
        featureFlags: {},
        params: {},
        timeout: 300000, // 5 minutes (quick scan)
        maxRetries: 2,
    },
    'external-links-exploration': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes
        maxRetries: 2,
    },
    'beleidsscan-graph': {
        featureFlags: {},
        params: {},
        timeout: 900000, // 15 minutes (graph operations)
        maxRetries: 1,
    },
    'bfs-3-hop': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes
        maxRetries: 2,
    },
    
    // Location-specific workflows
    'horst-aan-de-maas': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes
        maxRetries: 2,
    },
    'horst-labor-migration': {
        featureFlags: {},
        params: {},
        timeout: 600000, // 10 minutes
        maxRetries: 2,
    },
    'dso-location-search': {
        featureFlags: {},
        params: {},
        timeout: 300000, // 5 minutes
        maxRetries: 3,
    },
    
    // Legacy workflow IDs (for backward compatibility)
    'beleidsscan-wizard-step1-search-dso': {
        featureFlags: {},
        params: {},
        timeout: 300000,
        maxRetries: 3,
    },
    'beleidsscan-wizard-step2-enrich-dso': {
        featureFlags: {},
        params: {},
        timeout: 600000,
        maxRetries: 2,
    },
    'beleidsscan-wizard-step3-search-iplo': {
        featureFlags: {},
        params: {},
        timeout: 300000,
        maxRetries: 3,
    },
    'beleidsscan-wizard-step4-scan-known-sources': {
        featureFlags: {},
        params: {},
        timeout: 600000,
        maxRetries: 2,
    },
    'beleidsscan-wizard-step5-search-officielebekendmakingen': {
        featureFlags: {},
        params: {},
        timeout: 300000,
        maxRetries: 3,
    },
    'beleidsscan-wizard-step6-search-rechtspraak': {
        featureFlags: {},
        params: {},
        timeout: 300000,
        maxRetries: 3,
    },
    'beleidsscan-wizard-step7-search-common-crawl': {
        featureFlags: {},
        params: {},
        timeout: 900000,
        maxRetries: 2,
    },
    'beleidsscan-wizard-step9-merge-score': {
        featureFlags: {},
        params: {},
        timeout: 300000,
        maxRetries: 1,
    },
};

/**
 * Get default benchmark configuration for a workflow
 * 
 * @param workflowId - The workflow ID to get defaults for
 * @returns Default benchmark config if available, null otherwise
 */
export function getDefaultBenchmarkConfig(workflowId: string): WorkflowBenchmarkConfig | null {
    return DEFAULT_WORKFLOW_BENCHMARK_CONFIGS[workflowId] || null;
}

/**
 * Check if a workflow has a default benchmark configuration
 * 
 * @param workflowId - The workflow ID to check
 * @returns True if default config exists, false otherwise
 */
export function hasDefaultBenchmarkConfig(workflowId: string): boolean {
    return workflowId in DEFAULT_WORKFLOW_BENCHMARK_CONFIGS;
}

/**
 * Get all workflow IDs that have default benchmark configs
 * 
 * @returns Array of workflow IDs with default configs
 */
export function getWorkflowIdsWithDefaultConfigs(): string[] {
    return Object.keys(DEFAULT_WORKFLOW_BENCHMARK_CONFIGS);
}
