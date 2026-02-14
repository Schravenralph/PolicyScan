/**
 * ETL Validation Service
 * 
 * Validates RDF syntax and optionally SHACL shapes.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/12-etl-graphdb.md
 */

import { logger } from '../../utils/logger.js';
import * as fsPromises from 'fs/promises';
import { createReadStream } from 'fs';
import { StreamParser } from 'n3';

/**
 * RDF validation result
 */
export interface RDFValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * ETL Validation Service
 * 
 * For MVP, performs basic RDF syntax validation.
 * SHACL validation can be added later.
 */
export class ETLValidationService {
  /**
   * Validate RDF Turtle file syntax
   * 
   * Uses n3 to parse and validate Turtle syntax.
   */
  async validateTurtleFile(filePath: string): Promise<RDFValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check file exists
      await fsPromises.access(filePath);
      
      // Check if file is empty
      const stats = await fsPromises.stat(filePath);
      if (stats.size === 0) {
        errors.push('Turtle file is empty');
        return { valid: false, errors, warnings };
      }

      // Full RDF validation using n3 StreamParser
      await new Promise<void>((resolve) => {
        const stream = createReadStream(filePath, { encoding: 'utf-8' });
        const parser = new StreamParser();

        // Handle stream errors
        stream.on('error', (error) => {
          errors.push(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
          resolve();
        });

        // Handle parser errors
        parser.on('error', (parseError) => {
          errors.push(`RDF Syntax Error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        });

        // Consume data to keep the stream flowing
        parser.on('data', () => {});

        // Handle completion
        parser.on('end', () => {
          resolve();
        });

        // Pipe stream to parser
        stream.pipe(parser);
      });

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`Failed to access file: ${error instanceof Error ? error.message : String(error)}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Validate all Turtle files from an ETL run
   */
  async validateETLRunOutput(
    turtleFiles: string[],
    _manifestPath?: string
  ): Promise<{
    valid: boolean;
    fileResults: Map<string, RDFValidationResult>;
    totalErrors: number;
    totalWarnings: number;
  }> {
    const fileResults = new Map<string, RDFValidationResult>();
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const filePath of turtleFiles) {
      const result = await this.validateTurtleFile(filePath);
      fileResults.set(filePath, result);
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;

      if (!result.valid) {
        logger.warn({ filePath, errors: result.errors }, 'Turtle file validation failed');
      }
    }

    return {
      valid: totalErrors === 0,
      fileResults,
      totalErrors,
      totalWarnings,
    };
  }

  /**
   * Validate manifest file
   */
  async validateManifest(manifestPath: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const content = await fsPromises.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      // Check required fields
      if (!manifest.inputFingerprints) {
        errors.push('Manifest missing inputFingerprints');
      }

      if (!manifest.versions) {
        errors.push('Manifest missing versions');
      } else {
        if (!manifest.versions.nlpModelId) {
          errors.push('Manifest missing versions.nlpModelId');
        }
        if (!manifest.versions.rdfMappingVersion) {
          errors.push('Manifest missing versions.rdfMappingVersion');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`Failed to parse manifest: ${error instanceof Error ? error.message : String(error)}`);
      return { valid: false, errors };
    }
  }
}
