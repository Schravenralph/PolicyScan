/**
 * Database Index Optimization Migration
 * 
 * Adds compound indexes for common query patterns identified through analysis.
 * This migration is idempotent and can be run multiple times safely.
 * 
 * Based on analysis from: scripts/analyze-database-indexes.ts
 * 
 * Usage:
 *   - Run at server startup (via ensureIndexes calls)
 *   - Or run manually: tsx src/server/db/migrations/optimizeIndexes.ts
 */

import { getDB } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Optimize indexes for canonical_documents collection
 */
async function optimizeCanonicalDocumentIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('canonical_documents');
  
  try {
    // Compound index for workflow + query + date range queries (high frequency)
    await collection.createIndex(
      { 
        'enrichmentMetadata.workflowId': 1,
        'enrichmentMetadata.queryId': 1,
        createdAt: -1 
      },
      { 
        name: 'idx_workflow_query_createdAt',
        background: true,
        sparse: true // Only index documents with enrichmentMetadata
      }
    ).catch(() => {}); // Ignore if already exists
    
    // Compound index for workflow run queries
    await collection.createIndex(
      { 
        'enrichmentMetadata.workflowRunId': 1,
        createdAt: -1 
      },
      { 
        name: 'idx_workflowRun_createdAt',
        background: true,
        sparse: true
      }
    ).catch(() => {});
    
    // Compound index for area + document type queries
    await collection.createIndex(
      { 
        'sourceMetadata.spatialMetadata.areaId': 1,
        documentType: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_area_docType_createdAt',
        background: true,
        sparse: true // Only index documents with spatial metadata
      }
    ).catch(() => {});
    
    // Compound index for document family + type + language
    await collection.createIndex(
      { 
        documentFamily: 1,
        documentType: 1,
        language: 1 
      },
      { 
        name: 'idx_family_type_language',
        background: true
      }
    ).catch(() => {});
    
    // Index for temporal queries (validFrom/validTo)
    await collection.createIndex(
      { 
        'dates.validFrom': 1,
        'dates.validTo': 1 
      },
      { 
        name: 'idx_dates_valid',
        background: true,
        sparse: true
      }
    ).catch(() => {});
    
    logger.debug('Canonical document indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some canonical document indexes');
  }
}

/**
 * Optimize indexes for runs collection
 */
/**
 * Optimize indexes for runs collection
 * WI-SEC-005: Added indexes for createdBy for resource-level authorization
 */
async function optimizeRunIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('runs');
  
  try {
    // Compound index for createdBy + status + date queries (resource-level authorization)
    await collection.createIndex(
      { 
        createdBy: 1,
        status: 1,
        startTime: -1 
      },
      { 
        name: 'idx_createdBy_status_startTime',
        background: true,
        sparse: true // Only index documents with createdBy
      }
    ).catch(() => {});
    
    // Index for createdBy only (for filtering by owner)
    await collection.createIndex(
      { 
        createdBy: 1,
        startTime: -1 
      },
      { 
        name: 'idx_createdBy_startTime',
        background: true,
        sparse: true
      }
    ).catch(() => {});
    
    // Compound index for workflowId + status + date queries (high frequency)
    await collection.createIndex(
      { 
        'params.workflowId': 1,
        status: 1,
        startTime: -1 
      },
      { 
        name: 'idx_workflow_status_startTime',
        background: true
      }
    ).catch(() => {});
    
    // Compound index for queryId + status queries (high frequency)
    await collection.createIndex(
      { 
        'params.queryId': 1,
        status: 1,
        startTime: -1 
      },
      { 
        name: 'idx_query_status_startTime',
        background: true
      }
    ).catch(() => {});
    
    // Legacy index for userId (backward compatibility, can be removed after migration)
    await collection.createIndex(
      { 
        userId: 1,
        status: 1,
        startTime: -1 
      },
      { 
        name: 'idx_user_status_startTime',
        background: true,
        sparse: true
      }
    ).catch(() => {});
    
    // Compound index for status + type + startTime queries (getRunHistory with both filters)
    await collection.createIndex(
      { 
        status: 1,
        type: 1,
        startTime: -1 
      },
      { 
        name: 'idx_status_type_startTime',
        background: true
      }
    ).catch(() => {});
    
    // Compound index for status + startTime queries (markStaleRunsAsFailed, getRunHistory with status only)
    await collection.createIndex(
      { 
        status: 1,
        startTime: -1 
      },
      { 
        name: 'idx_status_startTime',
        background: true
      }
    ).catch(() => {});
    
    // Index for type + startTime queries (getRunHistory with type only)
    await collection.createIndex(
      { 
        type: 1,
        startTime: -1 
      },
      { 
        name: 'idx_type_startTime',
        background: true
      }
    ).catch(() => {});
    
    // Index for startTime only (getRecentRuns, date range queries)
    await collection.createIndex(
      { 
        startTime: -1 
      },
      { 
        name: 'idx_startTime',
        background: true
      }
    ).catch(() => {});
    
    logger.debug('Run indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some run indexes');
  }
}

/**
 * Optimize indexes for queries collection
 * WI-SEC-005: Updated to use createdBy instead of userId for resource-level authorization
 */
async function optimizeQueryIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('queries');
  
  try {
    // Compound index for createdBy + status queries (resource-level authorization)
    await collection.createIndex(
      { 
        createdBy: 1,
        status: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_createdBy_status_createdAt',
        background: true,
        sparse: true // Only index documents with createdBy
      }
    ).catch(() => {});
    
    // Index for createdBy only (for filtering by owner)
    await collection.createIndex(
      { 
        createdBy: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_createdBy_createdAt',
        background: true,
        sparse: true
      }
    ).catch(() => {});
    
    // Legacy index for userId (backward compatibility, can be removed after migration)
    await collection.createIndex(
      { 
        userId: 1,
        status: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_user_status_createdAt',
        background: true,
        sparse: true
      }
    ).catch(() => {});
    
    logger.debug('Query indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some query indexes');
  }
}

/**
 * Optimize indexes for workflows collection
 * Adds compound indexes for common workflow query patterns
 * Note: WorkflowModel already has basic indexes, this adds compound ones for common queries
 */
async function optimizeWorkflowIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('workflows');
  
  try {
    // Compound index for status + updatedAt queries (findByStatus, findAll sort by updatedAt)
    await collection.createIndex(
      { 
        status: 1,
        updatedAt: -1 
      },
      { 
        name: 'idx_status_updatedAt',
        background: true
      }
    ).catch(() => {});
    
    // Compound index for status + createdBy + updatedAt queries (user's workflows by status)
    await collection.createIndex(
      { 
        status: 1,
        createdBy: 1,
        updatedAt: -1 
      },
      { 
        name: 'idx_status_createdBy_updatedAt',
        background: true,
        sparse: true // Only index documents with createdBy
      }
    ).catch(() => {});
    
    // Compound index for createdBy + updatedAt queries (user's workflows)
    await collection.createIndex(
      { 
        createdBy: 1,
        updatedAt: -1 
      },
      { 
        name: 'idx_createdBy_updatedAt',
        background: true,
        sparse: true
      }
    ).catch(() => {});
    
    // Index for updatedAt only (findAll sorts by updatedAt)
    await collection.createIndex(
      { 
        updatedAt: -1 
      },
      { 
        name: 'idx_updatedAt',
        background: true
      }
    ).catch(() => {});
    
    logger.debug('Workflow indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some workflow indexes');
  }
}

/**
 * Optimize indexes for workflowPermissions collection
 * Adds compound indexes for common permission query patterns
 */
async function optimizeWorkflowPermissionIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('workflowPermissions');
  
  try {
    // Compound index for ownerId + visibility queries
    // Optimizes getSharedWorkflows queries that filter by ownerId or visibility
    await collection.createIndex(
      { 
        ownerId: 1,
        visibility: 1 
      },
      { 
        name: 'idx_ownerId_visibility',
        background: true
      }
    ).catch(() => {});
    
    // Compound index for permissions.userId + visibility queries
    // Optimizes queries that check user permissions and visibility
    await collection.createIndex(
      { 
        'permissions.userId': 1,
        visibility: 1 
      },
      { 
        name: 'idx_permissions_userId_visibility',
        background: true,
        sparse: true // Only index documents with permissions array
      }
    ).catch(() => {});
    
    logger.debug('WorkflowPermission indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some workflow permission indexes');
  }
}

/**
 * Optimize indexes for workflow_configurations collection
 * Adds compound indexes for common configuration query patterns
 */
async function optimizeWorkflowConfigurationIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('workflow_configurations');
  
  try {
    // Compound index for findByUser query (createdBy + isActive + createdAt sorting)
    // Optimizes queries that filter by user and sort by isActive and createdAt
    await collection.createIndex(
      { 
        createdBy: 1,
        isActive: -1,
        createdAt: -1 
      },
      { 
        name: 'idx_createdBy_isActive_createdAt',
        background: true
      }
    ).catch(() => {});
    
    logger.debug('WorkflowConfiguration indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some workflow configuration indexes');
  }
}

/**
 * Optimize indexes for exportTemplates collection
 * Adds compound indexes for common export template query patterns
 */
async function optimizeExportTemplateIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('exportTemplates');
  
  try {
    // Compound index for getTemplatesByUser query (createdBy + updatedAt sorting)
    await collection.createIndex(
      { 
        createdBy: 1,
        updatedAt: -1 
      },
      { 
        name: 'idx_createdBy_updatedAt',
        background: true
      }
    ).catch(() => {});
    
    // Compound index for getTemplatesByUser with includePublic (isPublic + updatedAt sorting)
    await collection.createIndex(
      { 
        isPublic: 1,
        updatedAt: -1 
      },
      { 
        name: 'idx_isPublic_updatedAt',
        background: true
      }
    ).catch(() => {});
    
    logger.debug('ExportTemplate indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some export template indexes');
  }
}

/**
 * Optimize indexes for action_executions collection
 * Adds compound indexes for common action execution query patterns
 */
async function optimizeActionExecutionIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('action_executions');
  
  try {
    // Compound index for findByQueryIdAndActionType query (queryId + actionType + createdAt sorting)
    await collection.createIndex(
      { 
        queryId: 1,
        actionType: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_queryId_actionType_createdAt',
        background: true
      }
    ).catch(() => {});
    
    // Compound index for findBySessionId query (sessionId + createdAt sorting)
    await collection.createIndex(
      { 
        sessionId: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_sessionId_createdAt',
        background: true
      }
    ).catch(() => {});
    
    logger.debug('ActionExecution indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some action execution indexes');
  }
}

/**
 * Optimize indexes for wizard_sessions collection
 * Adds compound indexes for common wizard session query patterns
 */
async function optimizeWizardSessionIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('wizard_sessions');
  
  try {
    // Compound index for findByWizardDefinition query (wizardDefinitionId + wizardDefinitionVersion + createdAt sorting)
    await collection.createIndex(
      { 
        wizardDefinitionId: 1,
        wizardDefinitionVersion: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_wizardDefinition_createdAt',
        background: true
      }
    ).catch(() => {});
    
    // Compound index for findByStatus query (status + createdAt sorting)
    await collection.createIndex(
      { 
        status: 1,
        createdAt: -1 
      },
      { 
        name: 'idx_status_createdAt',
        background: true
      }
    ).catch(() => {});
    
    logger.debug('WizardSession indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some wizard session indexes');
  }
}

/**
 * Optimize indexes for error_logs collection
 * (Note: ErrorLog model already has good indexes, but we can add compound ones)
 */
async function optimizeErrorLogIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('error_logs');
  
  try {
    // Compound index for component + status + date (if not already exists)
    // Check if idx_component exists first
    const indexes = await collection.indexes();
    const hasComponentIndex = indexes.some(idx => idx.name === 'idx_component');
    
    if (!hasComponentIndex) {
      await collection.createIndex(
        { 
          component: 1,
          status: 1,
          last_seen: -1 
        },
        { 
          name: 'idx_component_status_lastSeen',
          background: true
        }
      ).catch(() => {});
    }
    
    logger.debug('Error log indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some error log indexes');
  }
}

/**
 * Optimize indexes for notifications collection
 */
async function optimizeNotificationIndexes(): Promise<void> {
  const db = getDB();
  const collection = db.collection('notifications');

  try {
    // Compound index for findByUserId with read filter (user_id + read + created_at)
    // Covers { user_id: 1 } and { user_id: 1, read: 1 } queries as well
    await collection.createIndex(
      { user_id: 1, read: 1, created_at: -1 },
      { background: true, name: 'idx_userId_read_createdAt' }
    ).catch(() => {});

    // Compound index for findByUserId without read filter (user_id + created_at)
    // Essential for sorting by date when read status is not filtered
    await collection.createIndex(
      { user_id: 1, created_at: -1 },
      { background: true, name: 'idx_userId_createdAt' }
    ).catch(() => {});

    logger.debug('Notification indexes optimized');
  } catch (error) {
    logger.warn({ error }, 'Failed to optimize some notification indexes');
  }
}

/**
 * Main optimization function
 */
export async function optimizeDatabaseIndexes(): Promise<void> {
  logger.info('Starting database index optimization...');
  
  try {
    await optimizeCanonicalDocumentIndexes();
    await optimizeRunIndexes();
    await optimizeQueryIndexes();
    await optimizeWorkflowIndexes();
    await optimizeWorkflowPermissionIndexes();
    await optimizeWorkflowConfigurationIndexes();
    await optimizeNotificationIndexes();
    await optimizeExportTemplateIndexes();
    await optimizeWizardSessionIndexes();
    await optimizeActionExecutionIndexes();
    await optimizeErrorLogIndexes();
    
    logger.info('Database index optimization complete');
  } catch (error) {
    logger.error({ error }, 'Database index optimization failed');
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  optimizeDatabaseIndexes()
    .then(() => {
      logger.info('Index optimization complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Index optimization failed');
      process.exit(1);
    });
}

