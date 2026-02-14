import * as fs from 'fs/promises';
import * as path from 'path';
import type { Run } from '../../infrastructure/types.js';
import { TemplateEngine } from '../../templates/TemplateEngine.js';
import type { Template, TemplateValidationResult } from '../../../types/template.js';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import { TemplateContextBuilder } from './TemplateContextBuilder.js';

/**
 * Service for managing and generating workflow output templates
 */
export class WorkflowOutputTemplateService {
  private templates: Map<string, Template>;
  private templateEngine: TemplateEngine;
  private contextBuilder: TemplateContextBuilder;
  private outputDir: string;

  constructor(outputDir: string) {
    this.templates = new Map();
    this.templateEngine = new TemplateEngine();
    this.contextBuilder = new TemplateContextBuilder();
    this.outputDir = outputDir;
  }

  /**
   * Store a custom template
   */
  storeTemplate(template: Template): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): Template | undefined {
    return this.templates.get(templateId);
  }

  /**
   * List all stored templates
   */
  listTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  /**
   * Delete a template
   */
  deleteTemplate(templateId: string): boolean {
    return this.templates.delete(templateId);
  }

  /**
   * Validate a template
   */
  validateTemplate(template: Template): TemplateValidationResult {
    const availableVariables = this.contextBuilder.getAvailableVariables();
    return this.templateEngine.validate(template.content, availableVariables);
  }

  /**
   * Generate output using a custom template
   */
  async generateOutputWithTemplate(
    run: Run,
    templateId: string,
    output: WorkflowOutput,
    context: Record<string, unknown> = {}
  ): Promise<{
    outputPath: string;
    content: string;
  }> {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Create template context from output
    const templateContext = this.contextBuilder.createTemplateContext(output, context);

    // Render template
    const rendered = this.templateEngine.render(template.content, templateContext);

    // Write to file
    const runId = run._id?.toString() || 'unknown';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workflowName = String(run.params?.workflowName || run.type || 'workflow');
    const safeWorkflowName = workflowName.replace(/[^a-zA-Z0-9-]/g, '-');
    const baseName = `${safeWorkflowName}_${timestamp}_${runId}`;
    const extension = template.format === 'html' ? 'html' : template.format === 'markdown' ? 'md' : 'txt';
    const outputPath = path.join(this.outputDir, `${baseName}_custom.${extension}`);

    await fs.writeFile(outputPath, rendered, 'utf-8');

    console.log(`[WorkflowOutput] Generated custom template output: ${outputPath}`);

    return { outputPath, content: rendered };
  }
}



