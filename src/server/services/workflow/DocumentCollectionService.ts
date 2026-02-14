import { IRunManager } from './interfaces/IRunManager.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import { fetchDocumentsFromMetadata } from '../../routes/workflows/actions/documentContextHelpers.js';
import { logger } from '../../utils/logger.js';

export interface DocumentCollectionConfig {
    sourceKeys?: string[];
    priorityGroups?: string[][];
}

export class DocumentCollectionService {
    /**
     * Collect documents from rawDocumentsBySource based on configuration
     *
     * @param rawDocumentsBySource - Map of source keys to document arrays (or metadata arrays)
     * @param config - Configuration for source keys and priority groups
     * @param runId - Workflow run ID for logging
     * @param runManager - Run manager for workflow logging
     * @returns Array of collected CanonicalDocuments
     */
    async collectDocuments(
        rawDocumentsBySource: Record<string, unknown> | undefined,
        config: DocumentCollectionConfig,
        runId: string,
        runManager: IRunManager
    ): Promise<CanonicalDocument[]> {
        const coreDocuments: CanonicalDocument[] = [];

        // Return empty array if no documents source provided
        if (!rawDocumentsBySource) {
            await runManager.log(runId, '[i18n:workflowLogs.diagnosticRawDocumentsBySourceEmpty]', 'debug');
            return coreDocuments;
        }

        const sourceKeys = config.sourceKeys || [];
        const priorityGroups = config.priorityGroups || [];
        const hasConfiguration = sourceKeys.length > 0 || priorityGroups.length > 0;

        // Diagnostic logging
        const availableKeys = Object.keys(rawDocumentsBySource).filter(key => {
            const value = rawDocumentsBySource[key];
            return Array.isArray(value) && value.length > 0;
        });

        await runManager.log(
            runId,
            `[i18n:workflowLogs.diagnosticRawDocumentsBySourceKeys]|${availableKeys.join(',')}`,
            'debug'
        );

        if (hasConfiguration) {
            await runManager.log(runId, `[i18n:workflowLogs.usingConfiguredSourceKeys]|${sourceKeys.length}|${priorityGroups.length}`, 'debug');

            // 1. Process priorityGroups first (first match wins)
            for (const group of priorityGroups) {
                if (Array.isArray(group)) {
                    for (const key of group) {
                        if (rawDocumentsBySource[key] && Array.isArray(rawDocumentsBySource[key]) && rawDocumentsBySource[key].length > 0) {
                            try {
                                const docs = await fetchDocumentsFromMetadata(
                                    rawDocumentsBySource[key] as Array<{ _id: string }>
                                );
                                coreDocuments.push(...docs);
                                await runManager.log(runId, `[i18n:workflowLogs.foundDocumentsFromPriorityGroup]|${key}|${docs.length}`, 'info');
                                break; // Stop after finding first valid source in group
                            } catch (error) {
                                logger.error({ error, key, runId }, 'Error fetching documents from metadata');
                                await runManager.log(runId, `Error fetching documents for key ${key}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
                            }
                        }
                    }
                }
            }

            // 2. Process sourceKeys (simple collection)
            for (const key of sourceKeys) {
                if (rawDocumentsBySource[key] && Array.isArray(rawDocumentsBySource[key]) && rawDocumentsBySource[key].length > 0) {
                    try {
                        const docs = await fetchDocumentsFromMetadata(
                            rawDocumentsBySource[key] as Array<{ _id: string }>
                        );
                        coreDocuments.push(...docs);
                        await runManager.log(runId, `[i18n:workflowLogs.foundDocumentsFromSource]|${key}|${docs.length}`, 'info');
                    } catch (error) {
                        logger.error({ error, key, runId }, 'Error fetching documents from metadata');
                        await runManager.log(runId, `Error fetching documents for key ${key}: ${error instanceof Error ? error.message : String(error)}`, 'warn');
                    }
                }
            }
        } else {
            // No configuration provided - log warning
            await runManager.log(
                runId,
                'No configuration provided for document collection (sourceKeys/priorityGroups missing)',
                'warn'
            );
        }

        // Diagnostic logging: Log document counts from each source (generic)
        const counts = availableKeys.map(key => {
            const val = rawDocumentsBySource[key];
            const count = Array.isArray(val) ? val.length : 0;
            return `${key}:${count}`;
        }).join('|');

        await runManager.log(
            runId,
            `[i18n:workflowLogs.diagnosticDocumentCountsBySource]|${counts}`,
            'debug'
        );

        return coreDocuments;
    }
}
