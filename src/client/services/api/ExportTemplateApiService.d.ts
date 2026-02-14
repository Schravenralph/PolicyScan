import { BaseApiService } from './BaseApiService';
export type ExportFormat = 'csv' | 'pdf' | 'json' | 'xlsx' | 'markdown' | 'tsv' | 'html' | 'xml';
export interface ExportTemplate {
    _id?: string;
    name: string;
    description?: string;
    format: ExportFormat;
    template: string;
    variables: string[];
    createdBy: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    isPublic: boolean;
    isDefault?: boolean;
    usageCount: number;
    lastUsedAt?: string | Date;
}
export interface ExportTemplateCreateInput {
    name: string;
    description?: string;
    format: ExportFormat;
    template: string;
    variables?: string[];
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
export interface TemplateValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    variables: string[];
    availableVariables: string[];
}
/**
 * Export Template API service
 */
export declare class ExportTemplateApiService extends BaseApiService {
    /**
     * List export templates
     * @param params Query parameters (format, userId, public)
     */
    getTemplates(params?: {
        format?: ExportFormat;
        userId?: string;
        public?: boolean;
    }): Promise<ExportTemplate[]>;
    /**
     * Get a specific export template by ID
     */
    getTemplate(templateId: string): Promise<ExportTemplate>;
    /**
     * Create a new export template
     */
    createTemplate(input: ExportTemplateCreateInput): Promise<ExportTemplate>;
    /**
     * Update an export template
     */
    updateTemplate(templateId: string, input: ExportTemplateUpdateInput): Promise<ExportTemplate>;
    /**
     * Delete an export template
     */
    deleteTemplate(templateId: string): Promise<{
        message: string;
    }>;
    /**
     * Validate template content without saving
     */
    validateTemplate(templateContent: string): Promise<TemplateValidationResult>;
}
