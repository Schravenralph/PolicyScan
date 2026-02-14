/**
 * Website Preset Loader
 * 
 * Extracts query presets from website data (bronwebsites.json).
 * Creates presets based on subjects and themes found in website entries.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { QueryPreset } from '../types.js';
import { logger } from '../../../utils/logger.js';

interface WebsiteEntry {
  subjects?: string[];
  themes?: string[];
  [key: string]: unknown;
}

export class WebsitePresetLoader {
  private readonly websitesPath: string;

  constructor(websitesPath?: string) {
    // Default to project root if not provided
    this.websitesPath = websitesPath || join(process.cwd(), 'bronwebsites.json');
  }

  /**
   * Load presets from website data
   * @returns Array of query presets extracted from website data
   */
  async loadPresets(): Promise<QueryPreset[]> {
    const presets: QueryPreset[] = [];

    try {
      const websites = await this.loadWebsites();
      
      // Group by subjects and themes
      const subjectMap = new Map<string, Set<string>>();
      const themeMap = new Map<string, Set<string>>();

      for (const website of websites) {
        // Collect subjects
        if (Array.isArray(website.subjects)) {
          for (const subject of website.subjects) {
            if (typeof subject === 'string' && subject.length > 0) {
              if (!subjectMap.has(subject)) {
                subjectMap.set(subject, new Set());
              }
            }
          }
        }

        // Collect themes
        if (Array.isArray(website.themes)) {
          for (const theme of website.themes) {
            if (typeof theme === 'string' && theme.length > 0) {
              if (!themeMap.has(theme)) {
                themeMap.set(theme, new Set());
              }
            }
          }
        }
      }

      // Create presets from subjects
      const subjects = Array.from(subjectMap.keys());
      for (const subject of subjects) {
        presets.push({
          id: `website-subject-${this.sanitizeId(subject)}`,
          name: `Website: ${subject}`,
          description: `Queries gebaseerd op websites met onderwerp "${subject}"`,
          source: 'website',
          queries: this.normalizeQueries([subject, ...this.expandSubject(subject)]),
          category: this.inferCategory(subject),
          createdAt: new Date(),
        });
      }

      // Create presets from themes
      const themes = Array.from(themeMap.keys());
      for (const theme of themes) {
        presets.push({
          id: `website-theme-${this.sanitizeId(theme)}`,
          name: `Thema: ${theme}`,
          description: `Queries gebaseerd op websites met thema "${theme}"`,
          source: 'website',
          queries: this.normalizeQueries([theme]),
          category: 'thema',
          createdAt: new Date(),
        });
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to load website presets');
      // Return empty array on error to allow other loaders to continue
    }

    return presets;
  }

  /**
   * Load websites from JSON file
   */
  private async loadWebsites(): Promise<WebsiteEntry[]> {
    try {
      const content = await readFile(this.websitesPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      if (Array.isArray(parsed)) {
        return parsed;
      }
      
      logger.warn('bronwebsites.json is not an array, returning empty array');
      return [];
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        logger.warn(`bronwebsites.json not found at ${this.websitesPath}`);
      } else {
        logger.warn({ error }, 'Failed to parse bronwebsites.json');
      }
      return [];
    }
  }

  /**
   * Sanitize string for use in ID (lowercase, replace spaces with hyphens)
   */
  private sanitizeId(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  /**
   * Expand subject with related keywords
   */
  private expandSubject(subject: string): string[] {
    const subjectLower = subject.toLowerCase();
    const expansions: string[] = [];

    // Add common expansions based on subject
    if (subjectLower.includes('arbeidsmigrant')) {
      expansions.push('seizoensarbeid', 'migranten');
    }
    if (subjectLower.includes('huisvesting')) {
      expansions.push('woning', 'woningbouw');
    }
    if (subjectLower.includes('klimaat')) {
      expansions.push('klimaatadaptatie', 'klimaatverandering');
    }
    if (subjectLower.includes('energie')) {
      expansions.push('energietransitie', 'duurzaam');
    }

    return expansions;
  }

  /**
   * Infer category from subject
   */
  private inferCategory(subject: string): string {
    const subjectLower = subject.toLowerCase();

    if (subjectLower.includes('huisvesting') || subjectLower.includes('woning')) {
      return 'huisvesting';
    }
    if (subjectLower.includes('klimaat') || subjectLower.includes('energie')) {
      return 'klimaat';
    }
    if (subjectLower.includes('mobiliteit') || subjectLower.includes('vervoer')) {
      return 'mobiliteit';
    }
    if (subjectLower.includes('arbeidsmigrant')) {
      return 'arbeidsmigranten';
    }
    if (subjectLower.includes('ruimtelijk') || subjectLower.includes('omgeving')) {
      return 'ruimtelijke ordening';
    }

    return 'algemeen';
  }

  /**
   * Normalize queries: lowercase, trim, deduplicate, filter empty strings
   */
  private normalizeQueries(queries: string[]): string[] {
    const normalized = queries.map(q => q.toLowerCase().trim()).filter(q => q.length > 0);
    return Array.from(new Set(normalized));
  }
}
