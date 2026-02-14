import * as fs from 'fs/promises';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates JSON format output from workflow results
 */
export class JsonFormatGenerator implements FormatGenerator {
  /**
   * Generate JSON string from workflow output
   */
  generate(output: WorkflowOutput): string {
    return JSON.stringify(output, null, 2);
  }

  /**
   * Write JSON output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const json = this.generate(output);
      await fs.writeFile(filePath, json, 'utf-8');
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write JSON file ${filePath}:`, error);
      throw new Error(`Failed to write JSON output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}


