/**
 * System Preset Loader
 *
 * Loads hardcoded system presets that are always available.
 * These replace the hardcoded presets previously found in the frontend.
 */

import type { QueryPreset } from '../types.js';

export class SystemPresetLoader {
  /**
   * Load system presets
   * @returns Array of system query presets
   */
  loadPresets(): QueryPreset[] {
    return [
      {
        id: 'preset-common',
        name: 'common', // Lowercase to match legacy frontend name for compatibility
        description: 'Common Queries',
        source: 'manual',
        queries: ['milieu', 'woningbouw', 'verkeer', 'ruimtelijke ordening'],
        category: 'system',
        createdAt: new Date(),
      },
      {
        id: 'preset-edge-cases',
        name: 'edge-cases',
        description: 'Edge Cases',
        source: 'manual',
        queries: ['test', 'voorbeeld', 'demo'],
        category: 'system',
        createdAt: new Date(),
      },
      {
        id: 'preset-performance',
        name: 'performance',
        description: 'Performance Test Set',
        source: 'manual',
        queries: ['milieu', 'woningbouw', 'verkeer'],
        category: 'system',
        createdAt: new Date(),
      },
    ];
  }
}
