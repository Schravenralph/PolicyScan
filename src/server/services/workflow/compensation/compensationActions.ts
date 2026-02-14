/**
 * Compensation Actions
 * 
 * Defines compensation actions for workflow steps that perform external operations.
 * Most workflow steps are read-only and don't require compensation.
 * 
 * Steps that may need compensation:
 * - Step 4 (scan_known_sources): Clean up temporary files if created
 * - Step 5 (process_documents): Clean up temporary processing files
 * - Step 8 (search_common_crawl_optional): Clean up cached Common Crawl data
 */

import { logger } from '../../../utils/logger.js';
import type { CompensationAction } from './types.js';

/**
 * Compensation action for scan_known_sources step
 * Cleans up temporary files if any were created during scraping
 */
export const compensateScanKnownSources: CompensationAction = async (result, context) => {
    logger.info({ stepId: 'scan_known_sources' }, 'Executing compensation for scan_known_sources step');
    
    // Extract temporary files from result if present
    // This is a placeholder - actual implementation would need to track temp files
    const tempFiles = extractTempFiles(result);
    
    if (tempFiles.length === 0) {
        logger.debug({ stepId: 'scan_known_sources' }, 'No temporary files to clean up');
        return;
    }

    // Clean up temporary files
    for (const file of tempFiles) {
        try {
            const fs = await import('fs/promises');
            await fs.unlink(file);
            logger.debug({ stepId: 'scan_known_sources', file }, 'Cleaned up temporary file');
        } catch (error) {
            // Best effort - log but don't throw
            logger.warn(
                { stepId: 'scan_known_sources', file, error },
                'Failed to clean up temporary file during compensation'
            );
        }
    }
    
    logger.info({ stepId: 'scan_known_sources', cleanedFiles: tempFiles.length }, 'Compensation completed for scan_known_sources step');
};

/**
 * Compensation action for process_documents step
 * Cleans up temporary processing files if any were created
 */
export const compensateProcessDocuments: CompensationAction = async (result, context) => {
    logger.info({ stepId: 'process_documents' }, 'Executing compensation for process_documents step');
    
    // Extract temporary files from result if present
    const tempFiles = extractTempFiles(result);
    
    if (tempFiles.length === 0) {
        logger.debug({ stepId: 'process_documents' }, 'No temporary files to clean up');
        return;
    }

    // Clean up temporary files
    for (const file of tempFiles) {
        try {
            const fs = await import('fs/promises');
            await fs.unlink(file);
            logger.debug({ stepId: 'process_documents', file }, 'Cleaned up temporary file');
        } catch (error) {
            // Best effort - log but don't throw
            logger.warn(
                { stepId: 'process_documents', file, error },
                'Failed to clean up temporary file during compensation'
            );
        }
    }
    
    logger.info({ stepId: 'process_documents', cleanedFiles: tempFiles.length }, 'Compensation completed for process_documents step');
    // Note: LLM API costs cannot be reversed, but that's acceptable
};

/**
 * Compensation action for search_common_crawl_optional step
 * Cleans up cached Common Crawl data if any was downloaded
 */
export const compensateCommonCrawlSearch: CompensationAction = async (result, context) => {
    logger.info({ stepId: 'search_common_crawl_optional' }, 'Executing compensation for search_common_crawl_optional step');
    
    // Extract cache keys from result if present
    const cacheKeys = extractCacheKeys(result);
    
    if (cacheKeys.length === 0) {
        logger.debug({ stepId: 'search_common_crawl_optional' }, 'No cached data to clean up');
        return;
    }

    // Clean up cached data
    // Note: Cache cleanup is handled automatically by TTL expiration in the cache infrastructure
    // The cache service doesn't expose a delete method, so explicit cleanup isn't needed
    logger.debug({ stepId: 'search_common_crawl_optional' }, 'Cache cleanup handled by TTL expiration');
    
    logger.info({ stepId: 'search_common_crawl_optional', cleanedKeys: cacheKeys.length }, 'Compensation completed for search_common_crawl_optional step');
};

/**
 * Helper function to extract temporary file paths from step result
 * This is a placeholder - actual implementation would depend on how temp files are tracked
 */
function extractTempFiles(result: unknown): string[] {
    if (!result || typeof result !== 'object') {
        return [];
    }

    const resultObj = result as Record<string, unknown>;
    
    // Check for tempFiles array
    if (Array.isArray(resultObj.tempFiles)) {
        return resultObj.tempFiles.filter((f): f is string => typeof f === 'string');
    }
    
    // Check for tempFilePaths array
    if (Array.isArray(resultObj.tempFilePaths)) {
        return resultObj.tempFilePaths.filter((f): f is string => typeof f === 'string');
    }
    
    // Check for metadata.tempFiles
    if (resultObj.metadata && typeof resultObj.metadata === 'object') {
        const metadata = resultObj.metadata as Record<string, unknown>;
        if (Array.isArray(metadata.tempFiles)) {
            return metadata.tempFiles.filter((f): f is string => typeof f === 'string');
        }
    }
    
    return [];
}

/**
 * Helper function to extract cache keys from step result
 * This is a placeholder - actual implementation would depend on how cache keys are tracked
 */
function extractCacheKeys(result: unknown): string[] {
    if (!result || typeof result !== 'object') {
        return [];
    }

    const resultObj = result as Record<string, unknown>;
    
    // Check for cacheKeys array
    if (Array.isArray(resultObj.cacheKeys)) {
        return resultObj.cacheKeys.filter((k): k is string => typeof k === 'string');
    }
    
    // Check for metadata.cacheKeys
    if (resultObj.metadata && typeof resultObj.metadata === 'object') {
        const metadata = resultObj.metadata as Record<string, unknown>;
        if (Array.isArray(metadata.cacheKeys)) {
            return metadata.cacheKeys.filter((k): k is string => typeof k === 'string');
        }
    }
    
    return [];
}

/**
 * Register compensation actions for workflow steps
 * 
 * @param workflowEngine - The workflow engine to register compensation actions with
 */
export function registerCompensationActions(workflowEngine: { registerCompensationAction: (stepId: string, action: CompensationAction) => void }): void {
    // Register compensation actions for steps that may need them
    // Note: Most steps are read-only and don't need compensation
    
    // Step 4: scan_known_sources (may create temporary files)
    workflowEngine.registerCompensationAction('scan_known_sources', compensateScanKnownSources);
    
    // Step 5: process_documents (may create temporary processing files)
    workflowEngine.registerCompensationAction('process_documents', compensateProcessDocuments);
    
    // Step 8: search_common_crawl_optional (may download and cache Common Crawl data)
    workflowEngine.registerCompensationAction('search_common_crawl_optional', compensateCommonCrawlSearch);
    
    logger.info('Registered compensation actions for workflow steps');
}


