/**
 * Dictionary Update Service
 * 
 * Handles programmatic updates to synonym dictionary files.
 * Provides methods to add new terms, update existing entries, and manage
 * dictionary backups before making changes.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DictionaryUpdate {
  term: string;
  synonyms: string[];
  dictionary: 'dutch' | 'planning' | 'housing' | 'policy';
  confidence: number;
  source: 'feedback' | 'discovery';
}

export interface UpdateResult {
  success: boolean;
  dictionary: string;
  term: string;
  action: 'added' | 'updated' | 'skipped';
  reason?: string;
}

export class DictionaryUpdateService {
  private readonly synonymsPath: string;
  private readonly backupPath: string;

  constructor() {
    // Use process.cwd() for consistent path resolution in both local and Docker environments
    this.synonymsPath = join(process.cwd(), 'data', 'synonyms');
    this.backupPath = join(process.cwd(), 'data', 'synonyms', 'backups');
    
    // Ensure directories exist (will be called again in createBackup for safety)
    try {
      this.ensureDirectories();
    } catch (error) {
      // Log error but don't throw in constructor - will be caught when createBackup is called
      console.warn(`[DictionaryUpdateService] Could not create directories in constructor:`, error);
    }
  }

  /**
   * Ensure required directories exist
   * Can be called multiple times safely
   */
  private ensureDirectories(): void {
    // Ensure synonyms directory exists first
    if (!existsSync(this.synonymsPath)) {
      try {
        mkdirSync(this.synonymsPath, { recursive: true });
        console.log(`[DictionaryUpdateService] Created synonyms directory: ${this.synonymsPath}`);
      } catch (error) {
        console.error(`[DictionaryUpdateService] Failed to create synonyms directory: ${this.synonymsPath}`, error);
        throw new Error(`Failed to create synonyms directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Ensure backup directory exists
    if (!existsSync(this.backupPath)) {
      try {
        mkdirSync(this.backupPath, { recursive: true });
        console.log(`[DictionaryUpdateService] Created backup directory: ${this.backupPath}`);
      } catch (error) {
        console.error(`[DictionaryUpdateService] Failed to create backup directory: ${this.backupPath}`, error);
        throw new Error(`Failed to create backup directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Create backup of all dictionary files
   */
  async createBackup(): Promise<void> {
    // Ensure directories exist before creating backup
    this.ensureDirectories();
    
    const dictionaries = ['dutch-synonyms.json', 'planning-terms.json', 'housing-terms.json', 'policy-terms.json'];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    for (const dictFile of dictionaries) {
      const sourcePath = join(this.synonymsPath, dictFile);
      if (existsSync(sourcePath)) {
        const backupPath = join(this.backupPath, `${dictFile}.${timestamp}.backup`);
        copyFileSync(sourcePath, backupPath);
      }
    }
    
    console.log(`[DictionaryUpdateService] Created backup at ${timestamp}`);
  }

  /**
   * Load a dictionary file
   */
  private loadDictionary(dictionary: DictionaryUpdate['dictionary']): Record<string, string[]> {
    const fileMap: Record<string, string> = {
      dutch: 'dutch-synonyms.json',
      planning: 'planning-terms.json',
      housing: 'housing-terms.json',
      policy: 'policy-terms.json'
    };

    const filePath = join(this.synonymsPath, fileMap[dictionary]);
    
    if (!existsSync(filePath)) {
      console.warn(`[DictionaryUpdateService] Dictionary file not found: ${filePath}`);
      return {};
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[DictionaryUpdateService] Error loading dictionary ${dictionary}:`, error);
      return {};
    }
  }

  /**
   * Save a dictionary file
   */
  private saveDictionary(dictionary: DictionaryUpdate['dictionary'], data: Record<string, string[]>): void {
    const fileMap: Record<string, string> = {
      dutch: 'dutch-synonyms.json',
      planning: 'planning-terms.json',
      housing: 'housing-terms.json',
      policy: 'policy-terms.json'
    };

    const filePath = join(this.synonymsPath, fileMap[dictionary]);
    
    try {
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[DictionaryUpdateService] Saved dictionary ${dictionary} with ${Object.keys(data).length} entries`);
    } catch (error) {
      console.error(`[DictionaryUpdateService] Error saving dictionary ${dictionary}:`, error);
      throw error;
    }
  }

  /**
   * Update dictionary with multiple updates (batch)
   */
  async updateDictionary(
    updates: DictionaryUpdate[],
    dictionaryName: string = 'dutch',
    minConfidence: number = 0.6
  ): Promise<{
    success: boolean;
    termsAdded: number;
    synonymsAdded: number;
  }> {
    // Filter updates for the specified dictionary
    const relevantUpdates = updates.filter(u => u.dictionary === dictionaryName);
    
    if (relevantUpdates.length === 0) {
      return { success: true, termsAdded: 0, synonymsAdded: 0 };
    }

    // Create backup before updates
    await this.createBackup();

    // Load current dictionary
    const dictData = this.loadDictionary(dictionaryName as DictionaryUpdate['dictionary']);
    let termsAdded = 0;
    let synonymsAdded = 0;

    for (const update of relevantUpdates) {
      if (update.confidence < minConfidence) {
        continue; // Skip low-confidence terms
      }

      const termLower = update.term.toLowerCase();
      const existingSynonyms = dictData[termLower] || [];
      const newSynonyms = [...new Set([...existingSynonyms, ...update.synonyms])];
      
      if (newSynonyms.length > existingSynonyms.length) {
        dictData[termLower] = newSynonyms;
        if (existingSynonyms.length === 0) {
          termsAdded++;
        }
        synonymsAdded += (newSynonyms.length - existingSynonyms.length);
      }
    }

    // Save updated dictionary
    this.saveDictionary(dictionaryName as DictionaryUpdate['dictionary'], dictData);

    return {
      success: true,
      termsAdded,
      synonymsAdded
    };
  }

  /**
   * Add or update a single term in a dictionary
   */
  async updateSingleTerm(update: DictionaryUpdate): Promise<UpdateResult> {
    const { term, synonyms, dictionary, confidence } = update;
    const termLower = term.toLowerCase();

    // Load current dictionary
    const dictData = this.loadDictionary(dictionary);
    
    // Check if term already exists
    const existingSynonyms = dictData[termLower] || [];
    const newSynonyms = [...new Set([...existingSynonyms, ...synonyms])]; // Merge and deduplicate

    // Auto-approve high-confidence terms (>0.9)
    if (confidence > 0.9) {
      dictData[termLower] = newSynonyms;
      this.saveDictionary(dictionary, dictData);
      
      return {
        success: true,
        dictionary,
        term,
        action: existingSynonyms.length > 0 ? 'updated' : 'added'
      };
    }

    // Medium-confidence terms (0.6-0.9): flag for review but still add
    if (confidence >= 0.6) {
      dictData[termLower] = newSynonyms;
      this.saveDictionary(dictionary, dictData);
      
      console.log(`[DictionaryUpdateService] Added term "${term}" with medium confidence (${confidence.toFixed(2)}) - flagged for review`);
      
      return {
        success: true,
        dictionary,
        term,
        action: existingSynonyms.length > 0 ? 'updated' : 'added',
        reason: 'Medium confidence - review recommended'
      };
    }

    // Low-confidence terms (<0.6): skip
    return {
      success: false,
      dictionary,
      term,
      action: 'skipped',
      reason: `Low confidence (${confidence.toFixed(2)}) - below threshold`
    };
  }

  /**
   * Batch update multiple terms
   */
  async batchUpdate(updates: DictionaryUpdate[]): Promise<UpdateResult[]> {
    // Create backup before batch update
    await this.createBackup();

    const results: UpdateResult[] = [];
    
    for (const update of updates) {
      try {
        const result = await this.updateSingleTerm(update);
        results.push(result);
      } catch (error) {
        console.error(`[DictionaryUpdateService] Error updating term "${update.term}":`, error);
        results.push({
          success: false,
          dictionary: update.dictionary,
          term: update.term,
          action: 'skipped',
          reason: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[DictionaryUpdateService] Batch update completed: ${successCount}/${results.length} successful`);

    return results;
  }

  /**
   * Get dictionary statistics
   */
  getDictionaryStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    const dictionaries: DictionaryUpdate['dictionary'][] = ['dutch', 'planning', 'housing', 'policy'];

    for (const dict of dictionaries) {
      const data = this.loadDictionary(dict);
      stats[dict] = Object.keys(data).length;
    }

    return stats;
  }
}
