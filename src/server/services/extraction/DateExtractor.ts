import { ScrapedDocument } from '../infrastructure/types.js';

/**
 * Extracted date information
 */
export interface DateInfo {
  date: Date;
  confidence: number; // 0-1
  source: 'header' | 'footer' | 'content' | 'url' | 'metadata';
}

/**
 * Service for extracting publication dates from Dutch documents
 * 
 * Supports various Dutch date formats:
 * - "1 januari 2024"
 * - "01-01-2024"
 * - "2024-01-01"
 * - "januari 2024"
 * - "2024"
 */
export class DateExtractor {
  // Compiled regex patterns (reused for performance)
  private readonly pattern1: RegExp = /(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i;
  private readonly pattern2: RegExp = /(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})/i;
  private readonly pattern3: RegExp = /(\d{4})[-/](\d{2})[-/](\d{2})/;
  private readonly pattern4: RegExp = /(\d{2})[-/](\d{2})[-/](\d{4})/;
  private readonly pattern5: RegExp = /\b(19\d{2}|20\d{2})\b/;
  
  // Dutch month names (cached as Map for faster lookup)
  private readonly months: Map<string, number>;

  constructor() {
    // Initialize month map once
    this.months = new Map([
      ['januari', 1], ['februari', 2], ['maart', 3], ['april', 4],
      ['mei', 5], ['juni', 6], ['juli', 7], ['augustus', 8],
      ['september', 9], ['oktober', 10], ['november', 11], ['december', 12]
    ]);
  }

  /**
   * Extract date from document
   */
  extractDate(document: ScrapedDocument): DateInfo | null {
    // Try different sources in order of reliability
    const sources: Array<{ text: string; source: DateInfo['source'] }> = [
      { text: document.titel, source: 'header' },
      { text: document.samenvatting, source: 'content' },
      { text: document.url, source: 'url' }
    ];

    for (const { text, source } of sources) {
      const dateInfo = this.extractFromText(text, source);
      if (dateInfo) {
        return dateInfo;
      }
    }

    return null;
  }

  /**
   * Extract date from text string
   * Uses pre-compiled regex patterns for better performance
   */
  extractFromText(text: string, source: DateInfo['source'] = 'content'): DateInfo | null {
    if (!text) return null;

    // Pattern 1: "1 januari 2024" or "01 januari 2024"
    const match1 = this.pattern1.exec(text);
    if (match1) {
      const day = parseInt(match1[1], 10);
      const month = this.months.get(match1[2].toLowerCase());
      const year = parseInt(match1[3], 10);
      if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
        return {
          date: new Date(year, month - 1, day),
          confidence: 0.9,
          source
        };
      }
    }

    // Pattern 2: "januari 2024" (month and year only)
    const match2 = this.pattern2.exec(text);
    if (match2) {
      const month = this.months.get(match2[1].toLowerCase());
      const year = parseInt(match2[2], 10);
      if (month && year >= 1900 && year <= 2100) {
        return {
          date: new Date(year, month - 1, 1),
          confidence: 0.7,
          source
        };
      }
    }

    // Pattern 3: ISO format "2024-01-01" or "2024/01/01"
    const match3 = this.pattern3.exec(text);
    if (match3) {
      const year = parseInt(match3[1], 10);
      const month = parseInt(match3[2], 10);
      const day = parseInt(match3[3], 10);
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return {
          date: new Date(year, month - 1, day),
          confidence: 0.95,
          source
        };
      }
    }

    // Pattern 4: Dutch format "01-01-2024" or "01/01/2024"
    const match4 = this.pattern4.exec(text);
    if (match4) {
      const day = parseInt(match4[1], 10);
      const month = parseInt(match4[2], 10);
      const year = parseInt(match4[3], 10);
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return {
          date: new Date(year, month - 1, day),
          confidence: 0.85,
          source
        };
      }
    }

    // Pattern 5: Year only "2024"
    const match5 = this.pattern5.exec(text);
    if (match5) {
      const year = parseInt(match5[1], 10);
      if (year >= 1900 && year <= 2100) {
        return {
          date: new Date(year, 0, 1),
          confidence: 0.5,
          source
        };
      }
    }

    return null;
  }
}

