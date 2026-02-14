/**
 * Feature Flag Admin Routes
 * 
 * Routes for managing feature flags in the admin interface.
 */

import { Router, Request, Response } from 'express';
import { FeatureFlag, KGFeatureFlag } from '../../models/FeatureFlag.js';
import { BadRequestError } from '../../types/errors.js';
import { asyncHandler, sanitizeInput, auditMiddleware } from './shared/index.js';

/**
 * Register feature flag routes
 * 
 * @param router - Express router instance
 */
export function registerFeatureFlagRoutes(router: Router): void {
    /**
     * GET /api/admin/feature-flags
     * Get all feature flags
     */
    router.get('/feature-flags', asyncHandler(async (_req: Request, res: Response) => {
        await FeatureFlag.initializeService();
        const flags = await FeatureFlag.getAllKGFlags();
        res.json({ flags });
    }));

    /**
     * GET /api/admin/feature-flags/:flag
     * Get a specific feature flag
     */
    router.get('/feature-flags/:flag', asyncHandler(async (req: Request, res: Response) => {
        const { flag } = req.params;

        if (!Object.values(KGFeatureFlag).includes(flag as KGFeatureFlag)) {
            throw new BadRequestError(`Invalid feature flag: ${flag}`);
        }

        await FeatureFlag.initializeService();
        const enabled = FeatureFlag.isEnabled(flag as KGFeatureFlag);

        res.json({
            flag,
            enabled,
            timestamp: new Date().toISOString(),
        });
    }));

    /**
     * PUT /api/admin/feature-flags/:flag
     * Update a single feature flag
     */
    router.put('/feature-flags/:flag',
        sanitizeInput,
        auditMiddleware({
            action: 'system_config_changed',
            targetType: 'system',
            getTargetId: (req) => req.params.flag,
            getDetails: (req) => ({ 
                flag: req.params.flag,
                enabled: req.body.enabled,
                changedBy: req.user?.email || 'unknown'
            })
        }),
        asyncHandler(async (req: Request, res: Response) => {
            const { flag } = req.params;
            const { enabled } = req.body;

            if (!Object.values(KGFeatureFlag).includes(flag as KGFeatureFlag)) {
                throw new BadRequestError(`Invalid feature flag: ${flag}`);
            }

            if (typeof enabled !== 'boolean') {
                throw new BadRequestError('enabled must be a boolean');
            }

            await FeatureFlag.initializeService();
            await FeatureFlag.setKGFlag(flag as KGFeatureFlag, enabled, req.user?.email || 'admin');

            res.json({
                flag,
                enabled,
                message: 'Feature flag updated successfully',
                timestamp: new Date().toISOString(),
            });
        })
    );

    /**
     * PUT /api/admin/feature-flags
     * Update multiple feature flags at once
     */
    router.put('/feature-flags',
        sanitizeInput,
        auditMiddleware({
            action: 'system_config_changed',
            targetType: 'system',
            getDetails: (req) => ({ 
                flagsUpdated: (req.body.flags || []).length,
                flags: (req.body.flags || []).map((f: { flag: string; enabled: boolean }) => ({
                    flag: f.flag,
                    enabled: f.enabled
                })),
                changedBy: req.user?.email || 'unknown'
            })
        }),
        asyncHandler(async (req: Request, res: Response) => {
            const { flags } = req.body;

            if (!Array.isArray(flags)) {
                throw new BadRequestError('flags must be an array');
            }

            const updates: Array<{ flag: KGFeatureFlag; enabled: boolean }> = [];
            for (const flagUpdate of flags) {
                if (!flagUpdate.flag || typeof flagUpdate.enabled !== 'boolean') {
                    throw new BadRequestError('Each flag update must have flag (string) and enabled (boolean)');
                }
                if (!Object.values(KGFeatureFlag).includes(flagUpdate.flag as KGFeatureFlag)) {
                    throw new BadRequestError(`Invalid feature flag: ${flagUpdate.flag}`);
                }
                updates.push({
                    flag: flagUpdate.flag as KGFeatureFlag,
                    enabled: flagUpdate.enabled,
                });
            }

            await FeatureFlag.initializeService();
            // Set flags one by one
            for (const update of updates) {
                await FeatureFlag.setKGFlag(update.flag, update.enabled, req.user?.email || 'admin');
            }

            res.json({
                message: `Updated ${updates.length} feature flags`,
                flags: updates,
                timestamp: new Date().toISOString(),
            });
        })
    );
}

