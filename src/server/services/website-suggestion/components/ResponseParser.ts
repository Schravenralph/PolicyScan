import { logger } from '../../../utils/logger.js';
import { WebsiteSuggestion, ParsedWebsiteItem } from '../types.js';

export class ResponseParser {
  /**
   * Parse OpenAI recommendations from JSON response
   *
   * Improved error handling and logging to diagnose parsing failures.
   * Handles multiple JSON structures and validates URLs before including items.
   */
  parseOpenAIRecommendationsFromJSON(jsonText: string, websiteTypes: string[]): WebsiteSuggestion[] {
    if (!jsonText || !jsonText.trim()) {
      logger.warn('parseOpenAIRecommendationsFromJSON: Empty JSON text provided');
      return [];
    }

    try {
      const parsed = JSON.parse(jsonText);
      logger.debug({ jsonKeys: Array.isArray(parsed) ? 'root is array' : Object.keys(parsed) }, 'Parsed JSON structure');

      // Try multiple possible structures
      let websites: ParsedWebsiteItem[] = [];
      if (Array.isArray(parsed)) {
        websites = parsed;
        logger.debug({ count: websites.length }, 'Found array of websites');
      } else if (parsed.websites && Array.isArray(parsed.websites)) {
        websites = parsed.websites;
        logger.debug({ count: websites.length }, 'Found websites array in JSON');
      } else if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
        websites = parsed.recommendations;
        logger.debug({ count: websites.length }, 'Found recommendations array in JSON');
      } else if (parsed.results && Array.isArray(parsed.results)) {
        websites = parsed.results;
        logger.debug({ count: websites.length }, 'Found results array in JSON');
      } else if (parsed.data && Array.isArray(parsed.data)) {
        websites = parsed.data;
        logger.debug({ count: websites.length }, 'Found data array in JSON');
      } else {
        logger.warn({
          jsonKeys: Object.keys(parsed),
          jsonPreview: jsonText.substring(0, 500)
        }, 'Unexpected JSON structure - no websites/recommendations/results array found');
        return [];
      }

      if (websites.length === 0) {
        logger.warn(
          { jsonPreview: JSON.stringify(parsed, null, 2).substring(0, 1000) },
          'JSON parsed successfully but websites array is empty'
        );
        return [];
      }

      // Parse and validate each website item
      const parsedWebsites: WebsiteSuggestion[] = [];
      let skippedCount = 0;

      for (const item of websites) {
        // Validate URL before including
        if (!item.url || !item.url.trim()) {
          // Use title field (English) if available, otherwise titel (Dutch), otherwise name
          const itemTitle = item.title ?? item.titel ?? item.name ?? 'Untitled';
          logger.debug({
            item: {
              titel: itemTitle,
              hasUrl: !!item.url
            }
          }, 'Skipping item without URL');
          skippedCount++;
          continue;
        }

        // Prefer English 'title' field, fallback to Dutch 'titel', then 'name'
        const itemTitle = item.title ?? item.titel ?? item.name ?? 'Untitled';
        parsedWebsites.push({
          titel: itemTitle,
          url: item.url,
          samenvatting: item.samenvatting || item.summary || item.description || '',
          website_types: item.website_types || item.websiteTypes || websiteTypes,
          relevantie: item.relevantie || item.relevance || item.explanation || 'Recommended by AI'
        });
      }

      if (parsedWebsites.length === 0) {
        logger.warn(
          {
            skippedCount,
            totalItems: websites.length,
            sampleItems: JSON.stringify(websites.slice(0, 3), null, 2)
          },
          'All website items were filtered out during parsing - missing required fields (url, titel/title/name)'
        );
        return [];
      }

      if (skippedCount > 0) {
        logger.info({
          total: websites.length,
          parsed: parsedWebsites.length,
          skipped: skippedCount
        }, 'Parsed websites (some skipped due to missing URLs)');
      } else {
        logger.info({ count: parsedWebsites.length }, 'Parsed websites from JSON');
      }

      return parsedWebsites;

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error({
        error: errorMessage,
        jsonPreview: jsonText.substring(0, 1000)
      }, 'Failed to parse JSON recommendations');
      return [];
    }
  }

  /**
   * Parse OpenAI recommendations from text response
   */
  parseOpenAIRecommendations(text: string, websiteTypes: string[]): WebsiteSuggestion[] {
    const websites: WebsiteSuggestion[] = [];

    try {
      // Try to parse as JSON first
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ParsedWebsiteItem[];
        if (Array.isArray(parsed)) {
          return parsed.map((item: ParsedWebsiteItem) => ({
            // Prefer titel (Dutch internal format), fallback to name
            titel: item.titel ?? item.name ?? 'Untitled',
            url: item.url || '',
            samenvatting: item.samenvatting || item.description || '',
            website_types: item.website_types || websiteTypes,
            relevantie: 'Recommended by AI'
          }));
        }
      }
    } catch {
      // If JSON parsing fails, parse as text
    }

    // Parse as text format
    const lines = text.split('\n');
    let currentWebsite: Partial<WebsiteSuggestion> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.match(/^https?:\/\//)) {
        if (currentWebsite) {
          websites.push({
            titel: currentWebsite.titel ?? 'Untitled',
            url: currentWebsite.url || trimmed,
            samenvatting: currentWebsite.samenvatting || '',
            website_types: currentWebsite.website_types || websiteTypes,
            relevantie: 'Recommended by AI'
          });
        }
        currentWebsite = { url: trimmed };
      } else if (trimmed.match(/^(name|titel|title):/i)) {
        if (currentWebsite) {
          currentWebsite.titel = trimmed.replace(/^(name|titel|title):\s*/i, '');
        }
      } else if (trimmed.match(/^(description|samenvatting|summary):/i)) {
        if (currentWebsite) {
          currentWebsite.samenvatting = trimmed.replace(/^(description|samenvatting|summary):\s*/i, '');
        }
      }
    }

    if (currentWebsite && currentWebsite.url) {
      websites.push({
        titel: currentWebsite.titel ?? 'Untitled',
        url: currentWebsite.url,
        samenvatting: currentWebsite.samenvatting || '',
        website_types: currentWebsite.website_types || websiteTypes,
        relevantie: 'Recommended by AI'
      });
    }

    return websites;
  }

  /**
   * Extract title from URL (fallback when title is not available)
   */
  extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      // Capitalize first letter and remove .nl/.com etc
      return hostname.split('.')[0]
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } catch {
      return 'Untitled Website';
    }
  }
}
