/**
 * Template types for custom workflow output templates
 */

export interface Template {
  id: string;
  name: string;
  description?: string;
  content: string;
  format: 'markdown' | 'text' | 'html';
  variables: string[]; // List of available variables
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  isDefault?: boolean;
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'date' | 'array' | 'object';
  required?: boolean;
  defaultValue?: unknown;
}

export interface TemplateContext {
  [key: string]: unknown;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  variables: string[]; // Detected variables in template
}















