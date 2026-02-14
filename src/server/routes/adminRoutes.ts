import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { AuthService } from '../services/auth/AuthService.js';
import { registerFeatureFlagRoutes } from './admin/featureFlagRoutes.js';
import { registerKnowledgeGraphRoutes } from './admin/knowledgeGraphRoutes.js';
import { registerCostMonitoringRoutes } from './admin/costMonitoringRoutes.js';
import { registerUserRoutes } from './admin/userRoutes.js';
import { registerCacheRoutes } from './admin/cacheRoutes.js';
import { registerWorkflowRoutes } from './admin/workflowRoutes.js';
import { registerStatisticsRoutes } from './admin/statisticsRoutes.js';
import { registerLogsRoutes } from './admin/logsRoutes.js';
import { registerHealthRoutes } from './admin/healthRoutes.js';
import { registerAuditRoutes } from './admin/auditRoutes.js';
import { registerCircuitBreakerRoutes } from './admin/circuitBreakerRoutes.js';
import { registerThresholdRoutes } from './admin/thresholdRoutes.js';
import { registerErrorMonitoringRoutes } from './admin/errorMonitoringRoutes.js';
import { registerLearningSchedulerRoutes } from './admin/learningSchedulerRoutes.js';
import { registerDatabaseCleanupRoutes } from './admin/databaseCleanupRoutes.js';

export function createAdminRoutes(authService: AuthService): Router {
    const router = Router();

    // All admin routes require authentication and admin role
    router.use(authenticate(authService));
    router.use(authorize(['admin']));

    // Register route handler modules
    registerFeatureFlagRoutes(router);
    registerKnowledgeGraphRoutes(router);
    registerCostMonitoringRoutes(router);
    registerUserRoutes(router, authService);
    registerCacheRoutes(router);
    registerWorkflowRoutes(router);
    registerStatisticsRoutes(router);
    registerLogsRoutes(router);
    registerHealthRoutes(router, authService);
    registerAuditRoutes(router);
    registerCircuitBreakerRoutes(router);
    registerThresholdRoutes(router);
    registerErrorMonitoringRoutes(router);
    registerLearningSchedulerRoutes(router);
    registerDatabaseCleanupRoutes(router);

    // Statistics & metrics routes moved to admin/statisticsRoutes.ts
    // Logs routes moved to admin/logsRoutes.ts
    // Cache management routes moved to admin/cacheRoutes.ts
    // User management routes moved to admin/userRoutes.ts
    // Workflow management routes moved to admin/workflowRoutes.ts
    // Health & monitoring routes moved to admin/healthRoutes.ts
    // Audit log routes moved to admin/auditRoutes.ts
    // Circuit breaker routes moved to admin/circuitBreakerRoutes.ts
    // Threshold management routes moved to admin/thresholdRoutes.ts
    // Error monitoring routes moved to admin/errorMonitoringRoutes.ts
    // Learning scheduler routes moved to admin/learningSchedulerRoutes.ts

    return router;
}
