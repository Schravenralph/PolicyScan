/**
 * Workflow Output Validator Service
 * 
 * Uses LLM (ChatGPT-mini) to validate if workflow outputs make sense.
 * Can work in test mode without requiring a real OpenAI API key.
 */

import { LLMService, LLMMessage } from '../llm/LLMService.js';
import { logger } from '../../utils/logger.js';
// Use type-only import to avoid runtime dependency on mongodb/bson
import type { Run } from '../infrastructure/types.js';

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-100
  reasoning: string;
  issues: string[];
  suggestions: string[];
}

export interface WorkflowOutputSummary {
  workflowId: string;
  workflowName: string;
  status: string;
  stepCount: number;
  completedSteps: number;
  logs: Array<{ level: string; message: string }>;
  result?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export class WorkflowOutputValidator {
  private llmService: LLMService | null = null;
  private testMode: boolean;

  constructor(testMode: boolean = true) {
    this.testMode = testMode;
    
    // Initialize LLM service only if not in test mode or if API key is available
    if (!testMode && process.env.OPENAI_API_KEY) {
      this.llmService = new LLMService({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 1000
      });
    }
  }

  /**
   * Validate workflow output using LLM
   */
  async validateWorkflowOutput(
    workflow: { id: string; name: string; description?: string },
    run: Run,
    summary: WorkflowOutputSummary
  ): Promise<ValidationResult> {
    // In test mode without API key, return a mock validation
    if (this.testMode || !this.llmService) {
      return this.mockValidation(summary);
    }

    try {
      return await this.llmValidation(workflow, run, summary);
    } catch (error) {
      logger.warn({ error, workflowId: workflow.id }, 'LLM validation failed, falling back to mock');
      return this.mockValidation(summary);
    }
  }

  /**
   * Perform actual LLM validation
   */
  private async llmValidation(
    workflow: { id: string; name: string; description?: string },
    run: Run,
    summary: WorkflowOutputSummary
  ): Promise<ValidationResult> {
    if (!this.llmService) {
      throw new Error('LLM service not initialized');
    }

    const prompt = this.buildValidationPrompt(workflow, run, summary);
    
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a workflow output validator. Your job is to analyze workflow execution results and determine if they make sense. 
        
Consider:
1. Did the workflow complete successfully?
2. Are the outputs logical given the workflow's purpose?
3. Are there any obvious errors or inconsistencies?
4. Is the data structure correct?
5. Are the results meaningful?

Respond with a JSON object containing:
- isValid: boolean
- score: number (0-100)
- reasoning: string (brief explanation)
- issues: string[] (list of problems found)
- suggestions: string[] (suggestions for improvement)`
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const response = await this.llmService.generate(messages);
    
    try {
      // Try to parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isValid: parsed.isValid ?? true,
          score: parsed.score ?? 50,
          reasoning: parsed.reasoning || 'No reasoning provided',
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
        };
      }
    } catch (parseError) {
      logger.warn({ parseError, response: response.content }, 'Failed to parse LLM JSON response');
    }

    // Fallback: analyze response text
    const isValid = response.content.toLowerCase().includes('valid') || 
                   response.content.toLowerCase().includes('success');
    const score = isValid ? 75 : 40;

    return {
      isValid,
      score,
      reasoning: response.content.substring(0, 500),
      issues: [],
      suggestions: []
    };
  }

  /**
   * Build validation prompt for LLM
   */
  private buildValidationPrompt(
    workflow: { id: string; name: string; description?: string },
    run: Run,
    summary: WorkflowOutputSummary
  ): string {
    const resultPreview = summary.result 
      ? JSON.stringify(summary.result, null, 2).substring(0, 2000)
      : 'No result data';

    const logsPreview = summary.logs
      .slice(-20) // Last 20 logs
      .map(log => `[${log.level}] ${log.message}`)
      .join('\n');

    // Add workflow-specific validation criteria
    const specificCriteria = this.getWorkflowSpecificCriteria(workflow.id);

    return `Analyze this workflow execution:

Workflow: ${workflow.name} (${workflow.id})
Description: ${workflow.description || 'No description'}
Status: ${summary.status}
Steps: ${summary.completedSteps}/${summary.stepCount} completed

Recent Logs:
${logsPreview}

Result Data (preview):
${resultPreview}

Does this output make sense? Consider:
1. Workflow purpose: ${workflow.description || workflow.name}
2. Execution status: ${summary.status}
3. Step completion: ${summary.completedSteps}/${summary.stepCount}
4. Result structure and content
${specificCriteria ? `5. ${specificCriteria}` : ''}

Respond with JSON containing isValid, score, reasoning, issues, and suggestions.`;
  }

  /**
   * Get workflow-specific validation criteria
   */
  private getWorkflowSpecificCriteria(workflowId: string): string | null {
    // Rechtspraak workflow validation criteria
    if (workflowId === 'beleidsscan-step-7-rechtspraak' || workflowId.includes('rechtspraak')) {
      return `Rechtspraak-specific validation:
- Documents should have valid ECLI identifiers (format: ECLI:NL:[COURT]:[YEAR]:[ID])
- Documents should have proper titles and court information
- Documents should have decision dates
- Documents should have URLs to full decisions on rechtspraak.nl
- Documents should be relevant to the search query (onderwerp parameter)
- Documents should be properly categorized as 'jurisprudence'
- Source type should be 'RECHTSPRAAK'`;
    }

    return null;
  }

  /**
   * Mock validation for test mode (no API key required)
   */
  private mockValidation(summary: WorkflowOutputSummary): ValidationResult {
    const isValid = summary.status === 'completed';
    const score = isValid ? 80 : 30;
    
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (summary.status !== 'completed') {
      issues.push(`Workflow status is ${summary.status}, expected 'completed'`);
    }

    if (summary.completedSteps < summary.stepCount) {
      issues.push(`Only ${summary.completedSteps}/${summary.stepCount} steps completed`);
    }

    if (!summary.result || Object.keys(summary.result).length === 0) {
      issues.push('No result data found');
      suggestions.push('Check if workflow actions are returning results');
    }

    if (summary.logs.length === 0) {
      issues.push('No logs found');
    }

    const errorLogs = summary.logs.filter(log => log.level === 'error');
    if (errorLogs.length > 0) {
      issues.push(`Found ${errorLogs.length} error log(s)`);
      suggestions.push('Review error logs for details');
    }

    // Rechtspraak-specific validation
    if (summary.workflowId === 'beleidsscan-step-7-rechtspraak' || summary.workflowId.includes('rechtspraak')) {
      const rechtspraakDocs = summary.result?.rechtspraakDocuments as Array<Record<string, unknown>> | undefined;
      if (rechtspraakDocs && Array.isArray(rechtspraakDocs) && rechtspraakDocs.length > 0) {
        // Validate document structure
        const firstDoc = rechtspraakDocs[0];
        if (!firstDoc.sourceId || !String(firstDoc.sourceId).startsWith('ECLI:')) {
          issues.push('Documents missing valid ECLI identifiers');
          suggestions.push('Ensure ECLI extraction is working correctly');
        }
        if (firstDoc.sourceType !== 'RECHTSPRAAK') {
          issues.push('Documents should have sourceType "RECHTSPRAAK"');
        }
        if (firstDoc.documentCategory !== 'jurisprudence') {
          issues.push('Documents should have documentCategory "jurisprudence"');
        }
        if (!firstDoc.title) {
          issues.push('Documents missing titles');
        }
        if (!firstDoc.url) {
          issues.push('Documents missing URLs');
        }
      }
    }

    return {
      isValid: isValid && issues.length === 0,
      score,
      reasoning: `Mock validation: ${isValid ? 'Workflow completed successfully' : 'Workflow did not complete successfully'}. ${issues.length} issue(s) found.`,
      issues,
      suggestions
    };
  }

  /**
   * Create summary from run
   */
  static createSummary(run: Run, workflow: { id: string; name: string }): WorkflowOutputSummary {
    const logs = (run.logs || []).map(log => ({
      level: log.level || 'info',
      message: log.message || ''
    }));

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: run.status,
      stepCount: 0, // Will be set by caller if available
      completedSteps: 0, // Will be set by caller if available
      logs,
      result: run.result as Record<string, unknown> | undefined,
      context: run.params as Record<string, unknown> | undefined
    };
  }
}

