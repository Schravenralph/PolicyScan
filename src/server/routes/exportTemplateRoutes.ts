import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { NotFoundError, BadRequestError, AuthenticationError, AuthorizationError } from '../types/errors.js';
import { getExportTemplateModel, type ExportFormat } from '../models/ExportTemplate.js';
import { TemplateEngine } from '../services/templates/TemplateEngine.js';
import type { AuthService } from '../services/auth/AuthService.js';

/**
 * Available variables for export templates
 * These match the template context structure in ExportService.createTemplateContext()
 */
const AVAILABLE_VARIABLES = [
    'documents',
    'searchParams',
    'metadata',
    'helpers',
] as const;

/**
 * Creates routes for managing export templates
 */
export function createExportTemplateRoutes(authService: AuthService): Router {
    const router = Router();
    const templateEngine = new TemplateEngine();

    /**
     * GET /api/export/templates
     * List export templates
     * Query params: format, userId, public
     */
    router.get('/templates', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const templateModel = getExportTemplateModel();
        const { format, userId, public: includePublic } = req.query;
        let templates;

        if (format) {
            const validFormats: ExportFormat[] = ['csv', 'pdf', 'json', 'xlsx', 'markdown', 'tsv', 'html', 'xml'];
            if (typeof format === 'string' && validFormats.includes(format as ExportFormat)) {
                templates = await templateModel.getTemplatesByFormat(format as ExportFormat, includePublic === 'true', userId as string | undefined);
            } else {
                throw new BadRequestError(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
            }
        } else if (userId) {
            templates = await templateModel.getTemplatesByUser(userId as string, includePublic === 'true');
        } else if (includePublic === 'true') {
            templates = await templateModel.getPublicTemplates();
        } else {
            const currentUserId = req.user?.userId;
            if (!currentUserId) {
                throw new AuthenticationError('Authentication required');
            }
            templates = await templateModel.getTemplatesByUser(currentUserId, false);
        }

        res.json(templates);
    }));

    /**
     * GET /api/export/templates/:templateId
     * Get a specific export template
     */
    router.get('/templates/:templateId', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const { templateId } = req.params;
        const templateModel = getExportTemplateModel();
        const template = await templateModel.getTemplateById(templateId);
        if (!template) {
            throw new NotFoundError('Template', templateId);
        }
        res.json(template);
    }));

    /**
     * POST /api/export/templates
     * Create a new export template
     */
    router.post('/templates', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const templateModel = getExportTemplateModel();
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('Authentication required');
        }

        const { name, description, format, template: templateContent, variables, isPublic, isDefault } = req.body as {
            name?: string;
            description?: string;
            format?: string;
            template?: string;
            variables?: string[];
            isPublic?: boolean;
            isDefault?: boolean;
        };

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim() === '') {
            throw new BadRequestError('Template name is required', { field: 'name', received: name });
        }
        if (!format || typeof format !== 'string') {
            throw new BadRequestError('Template format is required', { field: 'format', received: format });
        }
        const validFormats: ExportFormat[] = ['csv', 'pdf', 'json', 'xlsx', 'markdown', 'tsv', 'html', 'xml'];
        if (!validFormats.includes(format as ExportFormat)) {
            throw new BadRequestError(`Invalid format. Must be one of: ${validFormats.join(', ')}`, { field: 'format', received: format });
        }
        if (!templateContent || typeof templateContent !== 'string' || templateContent.trim() === '') {
            throw new BadRequestError('Template content is required', { field: 'template', received: templateContent });
        }

        // Validate template content
        const validation = templateEngine.validate(templateContent, [...AVAILABLE_VARIABLES]);
        if (!validation.valid) {
            throw new BadRequestError('Template validation failed', {
                validation: {
                    errors: validation.errors,
                    warnings: validation.warnings,
                    variables: validation.variables,
                },
            });
        }

        const template = await templateModel.createTemplate({
            name: name.trim(),
            description: description?.trim(),
            format: format as ExportFormat,
            template: templateContent.trim(),
            variables: variables || validation.variables,
            createdBy: userId,
            isPublic: isPublic === true,
            isDefault: isDefault === true,
        });

        res.status(201).json(template);
    }));

    /**
     * PUT /api/export/templates/:templateId
     * Update an export template
     */
    router.put('/templates/:templateId', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const { templateId } = req.params;
        const templateModel = getExportTemplateModel();
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('Authentication required');
        }

        // Check if template exists and user owns it
        const existing = await templateModel.getTemplateById(templateId);
        if (!existing) {
            throw new NotFoundError('Template', templateId);
        }
        if (existing.createdBy.toString() !== userId) {
            throw new AuthorizationError('You do not have permission to update this template');
        }

        const { template: templateContent, variables, ...otherUpdates } = req.body as {
            template?: string;
            variables?: string[];
            [key: string]: unknown;
        };

        // If template content is being updated, validate it
        if (templateContent !== undefined) {
            if (typeof templateContent !== 'string' || templateContent.trim() === '') {
                throw new BadRequestError('Template content cannot be empty', { field: 'template' });
            }
            const validation = templateEngine.validate(templateContent, [...AVAILABLE_VARIABLES]);
            if (!validation.valid) {
                throw new BadRequestError('Template validation failed', {
                    validation: {
                        errors: validation.errors,
                        warnings: validation.warnings,
                        variables: validation.variables,
                    },
                });
            }
            otherUpdates.template = templateContent.trim();
            otherUpdates.variables = variables || validation.variables;
        }

        const template = await templateModel.updateTemplate(templateId, otherUpdates);
        if (!template) {
            throw new NotFoundError('Template', templateId);
        }
        res.json(template);
    }));

    /**
     * DELETE /api/export/templates/:templateId
     * Delete an export template
     */
    router.delete('/templates/:templateId', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const { templateId } = req.params;
        const templateModel = getExportTemplateModel();
        const userId = req.user?.userId;
        if (!userId) {
            throw new AuthenticationError('Authentication required');
        }

        // Check if template exists and user owns it
        const existing = await templateModel.getTemplateById(templateId);
        if (!existing) {
            throw new NotFoundError('Template', templateId);
        }
        if (existing.createdBy.toString() !== userId) {
            throw new AuthorizationError('You do not have permission to delete this template');
        }

        const deleted = await templateModel.deleteTemplate(templateId);
        if (!deleted) {
            throw new NotFoundError('Template', templateId);
        }
        res.json({ message: '[i18n:apiMessages.templateDeleted]' });
    }));

    /**
     * POST /api/export/templates/:templateId/validate
     * Validate a template without saving it
     */
    router.post('/templates/validate', authenticate(authService), asyncHandler(async (req: Request, res: Response) => {
        const { template: templateContent } = req.body as { template?: string };
        if (!templateContent || typeof templateContent !== 'string') {
            throw new BadRequestError('Template content is required', { field: 'template', received: templateContent });
        }

        const validation = templateEngine.validate(templateContent, [...AVAILABLE_VARIABLES]);
        res.json({
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            variables: validation.variables,
            availableVariables: AVAILABLE_VARIABLES,
        });
    }));

    return router;
}
