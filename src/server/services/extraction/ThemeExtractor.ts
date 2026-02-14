import { ScrapedDocument } from '../infrastructure/types.js';
import * as fs from 'fs';
import * as path from 'path';

// Cached taxonomy data to avoid redundant file reads
interface CachedTaxonomy {
  themeTaxonomy: Map<string, Set<string>>;
  keywordToTheme: Map<string, string>;
  keywordPatterns: { category: string, regex: RegExp }[];
}

let taxonomyCache: CachedTaxonomy | null = null;
let taxonomyPathLoaded: string | null = null;
let taxonomyLoadingPromise: Promise<void> | null = null;
let cacheVersion = 0;

/**
 * Service for extracting themes/subjects from documents
 * 
 * Uses:
 * - IMBOR themes (if available)
 * - Keyword matching
 * - Common policy themes
 */
export class ThemeExtractor {
  // Use Map for faster keyword lookups (O(1) vs O(n) array search)
  private themeTaxonomy: Map<string, Set<string>> | null = null;
  // Reverse mapping: keyword -> theme for faster lookups
  private keywordToTheme: Map<string, string> | null = null;
  private readonly maxThemes: number;
  // Common themes as Set for faster lookup
  private readonly commonThemes: Set<string>;

  // Pre-compiled regex patterns
  private readonly commonThemePatterns: { theme: string, regex: RegExp }[];
  private keywordPatterns: { category: string, regex: RegExp }[] | null = null;

  private readyPromise: Promise<void>;

  constructor(maxThemes: number = 5) {
    this.maxThemes = maxThemes;
    // Pre-compute common themes as Set
    const commonThemesList = [
      'wonen', 'housing', 'huisvesting',
      'mobiliteit', 'verkeer', 'transport',
      'milieu', 'duurzaamheid', 'klimaat',
      'economie', 'werkgelegenheid', 'arbeidsmarkt',
      'onderwijs', 'zorg', 'gezondheid',
      'cultuur', 'recreatie', 'sport',
      'veiligheid', 'openbare orde',
      'ruimtelijke ordening', 'planologie',
      'water', 'waterbeheer',
      'natuur', 'biodiversiteit',
      'energie', 'energietransitie',
      'arbeidsmigranten', 'arbeidsmigratie'
    ];
    this.commonThemes = new Set(commonThemesList);

    // Pre-compile regexes for common themes
    this.commonThemePatterns = commonThemesList.map(theme => ({
      theme,
      regex: new RegExp(`\\b${theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    }));

    this.readyPromise = this.loadThemeTaxonomy();
  }

  /**
   * Load theme taxonomy from file if available
   * Converts to Map structure for faster lookups
   */
  private async loadThemeTaxonomy(): Promise<void> {
    const taxonomyPath = process.env.THEME_TAXONOMY_PATH || 'data/themes/theme-taxonomy.json';
    const fullPath = path.resolve(process.cwd(), taxonomyPath);

    // Check cache first
    if (taxonomyCache && taxonomyPathLoaded === fullPath) {
      this.assignFromCache(taxonomyCache);
      return;
    }

    // If loading is in progress, wait for it
    if (taxonomyLoadingPromise) {
      await taxonomyLoadingPromise;
      if (taxonomyCache && taxonomyPathLoaded === fullPath) {
        this.assignFromCache(taxonomyCache);
        return;
      }
      // If paths don't match (race condition), continue to load our own path
    }

    // Start loading
    const currentVersion = cacheVersion;
    taxonomyLoadingPromise = (async () => {
      try {
        try {
          await fs.promises.access(fullPath);
        } catch {
          // File does not exist, silent return as per original logic (only logged if exists check passed but read failed in original, but here access fail means no exist)
          // Original logic: if (fs.existsSync(fullPath)) { ... }
          return;
        }

        const content = await fs.promises.readFile(fullPath, 'utf-8');
        
        // Check if cache was reset while we were awaiting I/O
        if (cacheVersion !== currentVersion) {
          return;
        }

        const rawTaxonomy: Record<string, string[]> = JSON.parse(content);
        
        // Convert to Map for faster lookups
        const themeTaxonomy = new Map<string, Set<string>>();
        const keywordToTheme = new Map<string, string>();
        const keywordPatterns: { category: string, regex: RegExp }[] = [];
        
        for (const [category, keywords] of Object.entries(rawTaxonomy)) {
          const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
          themeTaxonomy.set(category, keywordSet);
          
          // Build reverse mapping for O(1) keyword lookup
          for (const keyword of keywords) {
            const lowerKeyword = keyword.toLowerCase();
            keywordToTheme.set(lowerKeyword, category);

            // Pre-compile regex
            keywordPatterns.push({
              category,
              regex: new RegExp(`\\b${lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
            });
          }
        }
        
        // Update cache
        taxonomyCache = {
          themeTaxonomy,
          keywordToTheme,
          keywordPatterns
        };
        taxonomyPathLoaded = fullPath;

        console.log(`[ThemeExtractor] Loaded theme taxonomy from ${fullPath} (${themeTaxonomy.size} categories)`);
      } catch (error) {
        console.warn(`[ThemeExtractor] Could not load theme taxonomy: ${error}`);
        // Cache remains null
      } finally {
        taxonomyLoadingPromise = null;
      }
    })();

    await taxonomyLoadingPromise;

    if (taxonomyCache && taxonomyPathLoaded === fullPath) {
      this.assignFromCache(taxonomyCache);
    } else {
        this.themeTaxonomy = null;
        this.keywordToTheme = null;
        this.keywordPatterns = null;
    }
  }

  private assignFromCache(cache: CachedTaxonomy) {
    this.themeTaxonomy = cache.themeTaxonomy;
    this.keywordToTheme = cache.keywordToTheme;
    this.keywordPatterns = cache.keywordPatterns;
  }

  /**
   * Reset the internal cache (useful for testing)
   */
  static resetCache(): void {
    taxonomyCache = null;
    taxonomyPathLoaded = null;
    taxonomyLoadingPromise = null;
    cacheVersion++;
  }

  /**
   * Extract themes from document
   * Optimized with Set lookups and pre-computed mappings
   */
  async extractThemes(document: ScrapedDocument): Promise<string[]> {
    await this.readyPromise;

    const themes = new Set<string>();

    // Combine text from title and summary (lowercase once, reuse)
    const text = `${document.titel || ''} ${document.samenvatting || ''}`.toLowerCase();
    
    // Early return if text is empty
    if (!text.trim()) {
      return [];
    }

    // Check for common themes using pre-compiled regexes
    for (const { theme, regex } of this.commonThemePatterns) {
      if (regex.test(text)) {
        themes.add(theme);
        if (themes.size >= this.maxThemes) break;
      }
    }

    // Check taxonomy if available using pre-compiled regexes
    if (this.keywordPatterns && themes.size < this.maxThemes) {
      for (const { category, regex } of this.keywordPatterns) {
        if (regex.test(text)) {
          themes.add(category);
          if (themes.size >= this.maxThemes) break;
        }
      }
    }

    return Array.from(themes).slice(0, this.maxThemes);
  }
}
