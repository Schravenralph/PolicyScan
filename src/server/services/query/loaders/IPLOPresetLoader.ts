/**
 * IPLO Preset Loader
 * 
 * Extracts query presets from IPLO workflow configuration.
 * Creates presets based on known IPLO subjects (bodem, water, etc.).
 */

import { quickIploScanWorkflow } from '../../../workflows/predefinedWorkflows.js';
import type { QueryPreset } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class IPLOPresetLoader {
  /**
   * Load presets from IPLO workflow
   * @returns Array of query presets extracted from IPLO workflow
   */
  loadPresets(): QueryPreset[] {
    try {
      // Extract subjects from workflow (hardcoded in quickIploScanWorkflow)
      // These are the known IPLO subjects mentioned in the workflow documentation
      const iploSubjects = [
        'bodem',
        'water',
        'ruimtelijke ordening',
        'bouwen',
        'wonen',
        'milieu',
        'geluid',
        'externe veiligheid',
        'energie',
        'natuur',
        'klimaat'
      ];

      const presets: QueryPreset[] = [
        {
          id: 'iplo-all',
          name: 'IPLO Alle Onderwerpen',
          description: 'Alle bekende IPLO onderwerpen voor snelle scans',
          source: 'iplo',
          queries: iploSubjects,
          category: 'iplo',
          createdAt: new Date(),
        },
        // Create individual presets per subject
        ...iploSubjects.map(subject => ({
          id: `iplo-${this.sanitizeId(subject)}`,
          name: `IPLO ${this.formatName(subject)}`,
          description: `IPLO onderwerp: ${subject}`,
          source: 'iplo' as const,
          queries: [subject],
          category: 'iplo',
          createdAt: new Date(),
        }))
      ];

      return presets;
    } catch (error) {
      logger.error({ error }, 'Error loading IPLO presets');
      return [];
    }
  }

  /**
   * Format subject name (capitalize first letter of each word)
   */
  private formatName(subject: string): string {
    return subject
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Sanitize string for use in ID (lowercase, replace spaces with hyphens)
   */
  private sanitizeId(subject: string): string {
    return subject
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
}

