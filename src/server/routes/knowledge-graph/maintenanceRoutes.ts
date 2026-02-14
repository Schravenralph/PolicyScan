/**
 * Maintenance Routes for Knowledge Graph
 * 
 * Handles:
 * - POST /detect-changes - Detect changes in a single document
 * - POST /detect-batch-changes - Detect changes in multiple documents (batch processing)
 * - POST /incremental-update - Process a change set and apply incremental updates
 */

import express, { Router } from 'express';
import { asyncHandler } from '../../utils/errorHandling.js';
import { BadRequestError } from '../../types/errors.js';
import { ChangeDetectionService } from '../../services/knowledge-graph/maintenance/ChangeDetectionService.js';
import { ScrapedDocument } from '../../services/infrastructure/types.js';
import { ChangeSet } from '../../services/knowledge-graph/maintenance/ChangeSet.js';
import type { KnowledgeGraphServiceType, GraphDBKnowledgeGraphServiceType } from './shared/types.js';
import { getIncrementalUpdater } from './shared/services.js';

/**
 * Create maintenance router
 * 
 * @param getKGService - Function to get knowledge graph service instance
 * @param isGraphDB - Function to check if GraphDB backend is active
 * @returns Express router with maintenance routes
 */
export function createMaintenanceRouter(
    getKGService: () => KnowledgeGraphServiceType,
    isGraphDB: () => boolean
): Router {
    const router = express.Router();

    // Initialize change detection service (lazy initialization)
    let changeDetectionService: ChangeDetectionService | null = null;
    function getChangeDetectionService(): ChangeDetectionService {
        if (!changeDetectionService) {
            const kgService = getKGService() as GraphDBKnowledgeGraphServiceType;
            changeDetectionService = new ChangeDetectionService(kgService as any);
        }
        return changeDetectionService;
    }


    // POST /api/knowledge-graph/detect-changes
    // Detect changes in a single document
    // Body: { document: ScrapedDocument, options?: ChangeDetectionOptions }
    router.post('/detect-changes', asyncHandler(async (req, res) => {
        const { document, options } = req.body;

        if (!document || !document.url) {
            throw new BadRequestError('Document with URL is required');
        }

        const service = getChangeDetectionService();
        const changeSet = await service.detectDocumentChanges(document as ScrapedDocument, options);

        res.json({
            success: true,
            changeSet,
            summary: {
                totalChanges: changeSet.totalChanges,
                newDocuments: changeSet.newDocuments.length,
                updatedDocuments: changeSet.updatedDocuments.length,
                deletedDocuments: changeSet.deletedDocuments.length,
                newEntities: changeSet.newEntities.length,
                updatedEntities: changeSet.updatedEntities.length,
                deletedEntities: changeSet.deletedEntities.length,
                newRelationships: changeSet.newRelationships.length,
                updatedRelationships: changeSet.updatedRelationships.length,
                deletedRelationships: changeSet.deletedRelationships.length,
                processingTimeMs: changeSet.processingTimeMs
            }
        });
    }));

    // POST /api/knowledge-graph/detect-batch-changes
    // Detect changes in multiple documents (batch processing)
    // Body: { documents: ScrapedDocument[], options?: ChangeDetectionOptions }
    router.post('/detect-batch-changes', asyncHandler(async (req, res) => {
        const { documents, options } = req.body;

        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            throw new BadRequestError('Documents array is required and must not be empty');
        }

        const service = getChangeDetectionService();
        const result = await service.detectBatchChanges(documents as ScrapedDocument[], options);

        res.json({
            success: true,
            result,
            summary: {
                documentsProcessed: result.documentsProcessed,
                changesDetected: result.changesDetected,
                processingTimeMs: result.processingTimeMs,
                errors: result.errors?.length || 0,
                changeSetSummary: {
                    totalChanges: result.changeSet.totalChanges,
                    newDocuments: result.changeSet.newDocuments.length,
                    updatedDocuments: result.changeSet.updatedDocuments.length,
                    deletedDocuments: result.changeSet.deletedDocuments.length,
                    newEntities: result.changeSet.newEntities.length,
                    updatedEntities: result.changeSet.updatedEntities.length,
                    deletedEntities: result.changeSet.deletedEntities.length,
                    newRelationships: result.changeSet.newRelationships.length,
                    updatedRelationships: result.changeSet.updatedRelationships.length,
                    deletedRelationships: result.changeSet.deletedRelationships.length
                }
            }
        });
    }));

    // POST /api/knowledge-graph/incremental-update
    // Process a change set and apply incremental updates
    // Body: { changeSet: ChangeSet, options?: IncrementalUpdateOptions }
    router.post('/incremental-update', asyncHandler(async (req, res) => {
        const updater = await getIncrementalUpdater(getKGService, isGraphDB);
        if (!updater) {
            throw new BadRequestError('Incremental updates are not available', {
                message: 'Incremental updater could not be initialized. Check backend configuration and feature flags.'
            });
        }

        const { changeSet, options } = req.body;

        if (!changeSet) {
            throw new BadRequestError('Change set is required');
        }

        const result = await updater.processChangeSet(changeSet as ChangeSet, options);

        res.json({
            success: result.success,
            changeSetId: result.changeSetId,
            metrics: result.metrics,
            requiresManualReview: result.requiresManualReview,
            reviewItems: result.reviewItems,
            summary: {
                entitiesAdded: result.metrics.entitiesAdded,
                entitiesUpdated: result.metrics.entitiesUpdated,
                entitiesDeleted: result.metrics.entitiesDeleted,
                relationshipsAdded: result.metrics.relationshipsAdded,
                relationshipsUpdated: result.metrics.relationshipsUpdated,
                relationshipsDeleted: result.metrics.relationshipsDeleted,
                conflictsDetected: result.metrics.conflictsDetected,
                conflictsResolved: result.metrics.conflictsResolved,
                conflictsRequiringReview: result.metrics.conflictsRequiringReview,
                processingTimeMs: result.metrics.processingTimeMs,
                errors: result.metrics.errors.length
            }
        });
    }));

    return router;
}

