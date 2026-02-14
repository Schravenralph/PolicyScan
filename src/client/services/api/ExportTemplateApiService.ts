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
export class ExportTemplateApiService extends BaseApiService {
  /**
   * List export templates
   * @param params Query parameters (format, userId, public)
   */
  async getTemplates(params?: {
    format?: ExportFormat;
    userId?: string;
    public?: boolean;
  }): Promise<ExportTemplate[]> {
    const queryParams = new URLSearchParams();
    if (params?.format) queryParams.append('format', params.format);
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.public !== undefined) queryParams.append('public', params.public.toString());

    const url = `/export/templates${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return this.request<ExportTemplate[]>(url);
  }

  /**
   * Get a specific export template by ID
   */
  async getTemplate(templateId: string): Promise<ExportTemplate> {
    return this.request<ExportTemplate>(`/export/templates/${templateId}`);
  }

  /**
   * Create a new export template
   */
  async createTemplate(input: ExportTemplateCreateInput): Promise<ExportTemplate> {
    return this.request<ExportTemplate>('/export/templates', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Update an export template
   */
  async updateTemplate(templateId: string, input: ExportTemplateUpdateInput): Promise<ExportTemplate> {
    return this.request<ExportTemplate>(`/export/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  /**
   * Delete an export template
   */
  async deleteTemplate(templateId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/export/templates/${templateId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Validate template content without saving
   */
  async validateTemplate(templateContent: string): Promise<TemplateValidationResult> {
    return this.request<TemplateValidationResult>('/export/templates/validate', {
      method: 'POST',
      body: JSON.stringify({ template: templateContent }),
    });
  }
}

