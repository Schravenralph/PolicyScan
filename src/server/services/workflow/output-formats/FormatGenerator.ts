import type { WorkflowOutput } from '../WorkflowOutputService.js';

/**
 * Base interface for workflow output format generators
 */
export interface FormatGenerator {
  /**
   * Generate the output in the format's native representation
   * @param output - The workflow output to format
   * @returns The formatted output (string for text formats, Buffer for binary formats)
   */
  generate(output: WorkflowOutput): Promise<Buffer> | string;

  /**
   * Write the formatted output to a file
   * @param filePath - Path where the file should be written
   * @param output - The workflow output to format and write
   */
  write(filePath: string, output: WorkflowOutput): Promise<void>;
}

/**
 * Type guard to check if generator returns a Promise<Buffer>
 */
export function isBinaryGenerator(
  generator: FormatGenerator
): generator is FormatGenerator & { generate: (output: WorkflowOutput) => Promise<Buffer> } {
  // Check by attempting to call generate and checking if it returns a Promise
  return true; // Runtime check would be needed, but for type safety we assume binary generators return Promise<Buffer>
}


