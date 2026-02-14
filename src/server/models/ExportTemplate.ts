import { getDB } from '../config/database.js';
import { ObjectId, Collection, Filter, UpdateFilter } from 'mongodb';

export type ExportFormat = 'csv' | 'pdf' | 'json' | 'xlsx' | 'markdown' | 'tsv' | 'html' | 'xml';

export interface ExportTemplateDocument {
    _id?: ObjectId;
    name: string;
    description?: string;
    format: ExportFormat;
    template: string; // Template content using {{variable}} syntax
    variables: string[]; // List of available variables for this template
    createdBy: ObjectId;
    createdAt: Date;
    updatedAt: Date;
    isPublic: boolean;
    isDefault?: boolean; // Whether this is the default template for this format
    // Usage statistics
    usageCount: number;
    lastUsedAt?: Date;
}

export interface ExportTemplateCreateInput {
    name: string;
    description?: string;
    format: ExportFormat;
    template: string;
    variables?: string[];
    createdBy: string;
    isPublic?: boolean;
    isDefault?: boolean;
}

export interface ExportTemplateUpdateInput {
    name?: string;
    description?: string;
    template?: string;
    variables?: string[];
    isPublic?: boolean;
    isDefault?: boolean;
}

/**
 * Model for managing export templates in MongoDB.
 * 
 * Export templates allow users to customize how documents are exported
 * in various formats, using variable substitution syntax.
 */
export class ExportTemplateModel {
    private collection: Collection<ExportTemplateDocument>;

    constructor() {
        const db = getDB();
        this.collection = db.collection<ExportTemplateDocument>('exportTemplates');
        this.ensureIndexes().catch(err => {
            console.warn('Failed to create exportTemplates indexes:', err);
        });
    }

    private async ensureIndexes(): Promise<void> {
        try {
            // Index for getTemplatesByUser query (createdBy + updatedAt sorting)
            await this.collection.createIndex({ createdBy: 1, updatedAt: -1 }, { background: true });
            // Legacy index (keep for backward compatibility)
            await this.collection.createIndex({ createdBy: 1, createdAt: -1 }, { background: true });
            
            // Index for getTemplatesByUser with includePublic (isPublic + updatedAt sorting)
            await this.collection.createIndex({ isPublic: 1, updatedAt: -1 }, { background: true });
            
            // Index for getTemplatesByFormat query (format + isDefault + usageCount + updatedAt)
            await this.collection.createIndex({ format: 1, isDefault: 1 }, { background: true });
            await this.collection.createIndex({ format: 1, isPublic: 1 }, { background: true });
            
            // Index for getPublicTemplates query (isPublic + usageCount + updatedAt)
            await this.collection.createIndex({ isPublic: 1, usageCount: -1 }, { background: true });
        } catch (error) {
            if (error instanceof Error && !error.message.includes('already exists')) {
                throw error;
            }
        }
    }

    async createTemplate(input: ExportTemplateCreateInput): Promise<ExportTemplateDocument> {
        if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
            throw new Error('Template name is required');
        }
        if (!input.format || typeof input.format !== 'string') {
            throw new Error('Template format is required');
        }
        if (!input.template || typeof input.template !== 'string' || input.template.trim() === '') {
            throw new Error('Template content is required');
        }
        if (!input.createdBy || typeof input.createdBy !== 'string') {
            throw new Error('createdBy is required');
        }
        if (!ObjectId.isValid(input.createdBy)) {
            throw new Error('Invalid createdBy ObjectId format');
        }

        // If this is marked as default, unset other defaults for this format
        if (input.isDefault) {
            await this.collection.updateMany(
                { format: input.format, isDefault: true },
                { $set: { isDefault: false } }
            );
        }

        const template: ExportTemplateDocument = {
            name: input.name.trim(),
            description: input.description?.trim(),
            format: input.format,
            template: input.template.trim(),
            variables: input.variables || [],
            createdBy: new ObjectId(input.createdBy),
            createdAt: new Date(),
            updatedAt: new Date(),
            isPublic: input.isPublic ?? false,
            isDefault: input.isDefault ?? false,
            usageCount: 0
        };

        const result = await this.collection.insertOne(template);
        return { ...template, _id: result.insertedId };
    }

    async getTemplateById(templateId: string): Promise<ExportTemplateDocument | null> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }
        return this.collection.findOne({ _id: new ObjectId(templateId) });
    }

    async getTemplatesByUser(userId: string, includePublic: boolean = true): Promise<ExportTemplateDocument[]> {
        if (!ObjectId.isValid(userId)) {
            throw new Error('Invalid userId format');
        }

        const query: Filter<ExportTemplateDocument> = includePublic
            ? {
                $or: [
                    { createdBy: new ObjectId(userId) },
                    { isPublic: true }
                ]
            }
            : { createdBy: new ObjectId(userId) };

        // Limit to prevent memory exhaustion when loading templates
        // Default limit: 1000 templates, configurable via environment variable
        const MAX_EXPORT_TEMPLATES = parseInt(process.env.MAX_EXPORT_TEMPLATES || '1000', 10);
        
        const templates = await this.collection
            .find(query)
            .sort({ updatedAt: -1 })
            .limit(MAX_EXPORT_TEMPLATES)
            .toArray();
        
        if (templates.length === MAX_EXPORT_TEMPLATES) {
            console.warn(
                `[ExportTemplate] getTemplatesByUser() query may have been truncated at ${MAX_EXPORT_TEMPLATES} entries. ` +
                `Consider increasing MAX_EXPORT_TEMPLATES.`
            );
        }
        
        return templates;
    }

    async getTemplatesByFormat(format: ExportFormat, includePublic: boolean = true, userId?: string): Promise<ExportTemplateDocument[]> {
        const query: Filter<ExportTemplateDocument> = {
            format
        };

        if (userId && ObjectId.isValid(userId)) {
            if (includePublic) {
                query.$or = [
                    { createdBy: new ObjectId(userId) },
                    { isPublic: true }
                ];
            } else {
                query.createdBy = new ObjectId(userId);
            }
        } else if (includePublic) {
            query.isPublic = true;
        }

        // Limit to prevent memory exhaustion when loading templates
        // Default limit: 1000 templates, configurable via environment variable
        const MAX_EXPORT_TEMPLATES = parseInt(process.env.MAX_EXPORT_TEMPLATES || '1000', 10);
        
        const templates = await this.collection
            .find(query)
            .sort({ isDefault: -1, usageCount: -1, updatedAt: -1 })
            .limit(MAX_EXPORT_TEMPLATES)
            .toArray();
        
        if (templates.length === MAX_EXPORT_TEMPLATES) {
            console.warn(
                `[ExportTemplate] getTemplatesByFormat() query may have been truncated at ${MAX_EXPORT_TEMPLATES} entries. ` +
                `Consider increasing MAX_EXPORT_TEMPLATES.`
            );
        }
        
        return templates;
    }

    async getDefaultTemplate(format: ExportFormat): Promise<ExportTemplateDocument | null> {
        return this.collection.findOne({ format, isDefault: true });
    }

    async getPublicTemplates(limit: number = 20): Promise<ExportTemplateDocument[]> {
        return this.collection
            .find({ isPublic: true })
            .sort({ usageCount: -1, updatedAt: -1 })
            .limit(limit)
            .toArray();
    }

    async updateTemplate(
        templateId: string,
        updates: ExportTemplateUpdateInput
    ): Promise<ExportTemplateDocument | null> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }

        // If setting as default, unset other defaults for the same format
        if (updates.isDefault === true) {
            const existing = await this.getTemplateById(templateId);
            if (existing) {
                await this.collection.updateMany(
                    { format: existing.format, isDefault: true, _id: { $ne: new ObjectId(templateId) } },
                    { $set: { isDefault: false } }
                );
            }
        }

        const updateDoc: UpdateFilter<ExportTemplateDocument> = {
            $set: {
                ...updates,
                updatedAt: new Date()
            }
        };

        const filter: Filter<ExportTemplateDocument> = { _id: new ObjectId(templateId) };
        const result = await this.collection.findOneAndUpdate(
            filter,
            updateDoc,
            { returnDocument: 'after' }
        );

        return result || null;
    }

    async incrementUsage(templateId: string): Promise<void> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }

        const filter: Filter<ExportTemplateDocument> = { _id: new ObjectId(templateId) };
        const updateFilter: UpdateFilter<ExportTemplateDocument> = {
            $inc: { usageCount: 1 },
            $set: { lastUsedAt: new Date() }
        };
        await this.collection.updateOne(
            filter,
            updateFilter
        );
    }

    async deleteTemplate(templateId: string): Promise<boolean> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }

        const result = await this.collection.deleteOne({ _id: new ObjectId(templateId) });
        return result.deletedCount > 0;
    }
}

// Singleton instance
let templateModelInstance: ExportTemplateModel | null = null;

export function getExportTemplateModel(): ExportTemplateModel {
    if (!templateModelInstance) {
        templateModelInstance = new ExportTemplateModel();
    }
    return templateModelInstance;
}

