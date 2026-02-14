/**
 * Template Engine for processing custom templates
 * 
 * Supports simple {{variable}} syntax for variable substitution
 * and basic control structures like {{#if condition}}...{{/if}}
 */

import { Template, TemplateContext, TemplateValidationResult } from '../../types/template.js';

export class TemplateEngine {
  /**
   * Render a template with the provided context
   * 
   * @param template Template content
   * @param context Variable context
   * @returns Rendered template string
   */
  render(template: string, context: TemplateContext): string {
    // Security: Limit input length to prevent ReDoS attacks
    const MAX_TEMPLATE_LENGTH = 100000;
    if (template.length > MAX_TEMPLATE_LENGTH) {
      throw new Error(`Template exceeds maximum length of ${MAX_TEMPLATE_LENGTH} characters`);
    }

    let result = template;

    // Process variables using single regex replacement
    // Use safer regex with bounded quantifiers to prevent ReDoS
    result = result.replace(/\{\{([^}]{1,200})\}\}/g, (match, variableExpr) => {
      variableExpr = variableExpr.trim();

      // Skip control structures - return original match
      if (variableExpr.startsWith('#') || variableExpr.startsWith('/')) {
        return match;
      }

      const value = this.resolveVariable(variableExpr, context);
      return this.formatValue(value);
    });

    // Process simple conditionals {{#if variable}}...{{/if}}
    result = this.processConditionals(result, context);

    return result;
  }

  /**
   * Resolve a variable from context (supports dot notation)
   */
  private resolveVariable(variableExpr: string, context: TemplateContext): unknown {
    const parts = variableExpr.split('.');
    let value: unknown = context;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Format a value for output
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /**
   * Process simple conditional statements {{#if variable}}...{{/if}}
   */
  private processConditionals(template: string, context: TemplateContext): string {
    // Use safer regex with bounded quantifiers and non-greedy matching
    const ifRegex = /\{\{#if\s+([^}]{1,200})\}\}([\s\S]{0,10000}?)\{\{\/if\}\}/g;
    let result = template;

    let match;
    let matchCount = 0;
    const MAX_MATCHES = 1000; // Prevent excessive iterations
    const matches: Array<{ fullMatch: string; condition: string; content: string }> = [];

    // Collect all matches first to avoid modifying string during iteration
    while ((match = ifRegex.exec(template)) !== null && matchCount < MAX_MATCHES) {
      matchCount++;
      matches.push({
        fullMatch: match[0],
        condition: match[1].trim(),
        content: match[2],
      });
    }

    // Process matches in reverse order to maintain indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const { fullMatch, condition, content } = matches[i];
      const value = this.resolveVariable(condition, context);
      const isTruthy = this.isTruthy(value);

      if (isTruthy) {
        result = result.replace(fullMatch, content);
      } else {
        result = result.replace(fullMatch, '');
      }
    }

    return result;
  }

  /**
   * Check if a value is truthy
   */
  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      return value.length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value).length > 0;
    }
    return true;
  }

  /**
   * Validate a template
   * 
   * @param template Template content
   * @param availableVariables Optional list of available variables
   * @returns Validation result
   */
  validate(template: string, availableVariables?: string[]): TemplateValidationResult {
    // Security: Limit input length to prevent ReDoS attacks
    const MAX_TEMPLATE_LENGTH = 100000;
    if (template.length > MAX_TEMPLATE_LENGTH) {
      return {
        valid: false,
        errors: [`Template exceeds maximum length of ${MAX_TEMPLATE_LENGTH} characters`],
        warnings: [],
        variables: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const variables = new Set<string>();

    // Extract all variables with bounded quantifiers
    const variableRegex = /\{\{([^}]{1,200})\}\}/g;
    let match;
    let matchCount = 0;
    const MAX_MATCHES = 10000; // Prevent excessive iterations

    while ((match = variableRegex.exec(template)) !== null && matchCount < MAX_MATCHES) {
      matchCount++;
      const variableExpr = match[1].trim();
      
      // Skip control structures
      if (variableExpr.startsWith('#') || variableExpr.startsWith('/')) {
        continue;
      }

      variables.add(variableExpr);

      // Check if variable is available (if list provided)
      if (availableVariables && !this.isVariableAvailable(variableExpr, availableVariables)) {
        warnings.push(`Variable "${variableExpr}" may not be available`);
      }
    }

    // Check for unmatched conditionals with safer regex
    const ifCount = (template.match(/\{\{#if\s+[^}]{1,200}\}\}/g) || []).length;
    const endifCount = (template.match(/\{\{\/if\}\}/g) || []).length;
    
    if (ifCount !== endifCount) {
      errors.push(`Mismatched conditionals: ${ifCount} {{#if}} but ${endifCount} {{/if}}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      variables: Array.from(variables)
    };
  }

  /**
   * Check if a variable is available (supports dot notation)
   */
  private isVariableAvailable(variableExpr: string, availableVariables: string[]): boolean {
    const parts = variableExpr.split('.');
    const baseVar = parts[0];
    return availableVariables.includes(baseVar);
  }
}












