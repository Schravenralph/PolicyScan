/**
 * Workflow Module Template
 * 
 * This is a template file for creating new workflow modules.
 * Copy this file and rename it to your module name (e.g., MyNewModule.ts).
 * 
 * Usage:
 * 1. Copy this file to a new file named after your module
 * 2. Replace all instances of "Template" with your module name
 * 3. Replace all instances of "template" with your module name (lowercase)
 * 4. Implement the abstract methods
 * 5. Add your module to src/server/services/workflowModules/index.ts
 * 
 * @example
 * ```bash
 * cp ModuleTemplate.ts MyNewModule.ts
 * # Then edit MyNewModule.ts and replace Template with MyNewModule
 * ```
 */

import { BaseWorkflowModule, WorkflowContext, ModuleParameterSchema } from '../workflow/WorkflowModule.js';
import type { ModuleMetadata } from '../../types/module-metadata.js';
import { RunManager } from '../workflow/RunManager.js';
import { ensureDBConnection } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * TemplateModule
 * 
 * Description of what this module does.
 */
export class TemplateModule extends BaseWorkflowModule {
    id = 'Template';
    name = 'Template Module';
    description = 'Description of what this module does';
    category = 'processing'; // Options: 'discovery', 'crawling', 'processing', 'storage', 'analysis'

    private runManager: RunManager | null = null;

    constructor() {
        super();
    }

    /**
     * Get RunManager instance, initializing it lazily with ensureDBConnection()
     */
    private async getRunManager(): Promise<RunManager> {
        if (!this.runManager) {
            const db = await ensureDBConnection();
            this.runManager = new RunManager(db);
        }
        return this.runManager;
    }

    /**
     * Execute the module
     * 
     * @param context Workflow context (contains data from previous steps)
     * @param params Module parameters (from workflow step.params)
     * @param runId Workflow run ID for logging
     * @returns Updated workflow context
     */
    async execute(
        context: WorkflowContext,
        params: Record<string, unknown>,
        runId: string,
        signal?: AbortSignal
    ): Promise<WorkflowContext> {
        const runManager = await this.getRunManager();
        await runManager.log(runId, `Start ${this.name} uitvoering...`, 'info');

        try {
            // Extract parameters
            const myParam = params.myParam as string | undefined;
            const myNumber = (params.myNumber as number) || 10;
            const myBoolean = (params.myBoolean as boolean) ?? true;

            // Access context from previous steps
            const previousData = (context.previousData as unknown[]) || [];

            // Perform module logic here
            await runManager.log(runId, `${previousData.length} items verwerken...`, 'info');

            // Example: Process data
            const processedData = previousData.map((item, index) => {
                // Process each item
                const itemObj = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return { ...itemObj, processed: true, index };
            });

            await runManager.log(runId, `${processedData.length} items verwerkt`, 'info');

            // Return updated context
            return {
                ...context,
                processedData,
                result: 'module execution completed',
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const runManager = await this.getRunManager();
            await runManager.log(runId, `Fout in ${this.name}: ${errorMessage}`, 'error');
            logger.error({ error, runId, moduleId: this.id }, `Error executing ${this.name}`);
            throw error;
        }
    }

    /**
     * Get module metadata for registry
     */
    getMetadata(): ModuleMetadata {
        return {
            id: this.id,
            name: this.name,
            version: '1.0.0',
            description: this.description,
            category: this.category,
            author: {
                name: 'Your Name',
                email: 'your.email@example.com',
            },
            license: 'MIT',
            tags: ['tag1', 'tag2'],
            dependencies: [],
            published: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }

    /**
     * Get default parameter values
     */
    getDefaultParams(): Record<string, unknown> {
        return {
            myParam: 'default value',
            myNumber: 10,
            myBoolean: true,
        };
    }

    /**
     * Get parameter schema for UI generation
     */
    getParameterSchema(): ModuleParameterSchema {
        return {
            myParam: {
                type: 'string',
                label: 'My Parameter',
                description: 'Description of the parameter',
                required: true,
                default: 'default value',
            },
            myNumber: {
                type: 'number',
                label: 'My Number',
                description: 'A number parameter',
                required: false,
                default: 10,
                validation: {
                    min: 0,
                    max: 100,
                },
            },
            myBoolean: {
                type: 'boolean',
                label: 'My Boolean',
                description: 'A boolean parameter',
                required: false,
                default: true,
            },
            mySelect: {
                type: 'string',
                label: 'My Select',
                description: 'A select dropdown',
                required: true,
                options: [
                    { value: 'option1', label: 'Option 1' },
                    { value: 'option2', label: 'Option 2' },
                ],
            },
        };
    }
}

