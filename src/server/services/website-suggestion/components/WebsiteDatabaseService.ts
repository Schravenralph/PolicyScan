import { Db, Filter } from 'mongodb';
import { BronWebsiteDocument } from '../../../types/index.js';
import { logger } from '../../../utils/logger.js';
import { WebsiteSuggestion, WebsiteSuggestionParams } from '../types.js';
import { createMunicipalityNameQuery } from '../../../utils/municipalityNameMatcher.js';

export class WebsiteDatabaseService {
  constructor(private db: Db) {}

  /**
   * Find matching websites in database
   * 
   * Uses a more flexible matching strategy:
   * 1. First tries exact matches (websiteTypes + onderwerp in title/summary)
   * 2. Falls back to websiteTypes only (if onderwerp doesn't match)
   * 3. This ensures we find relevant government websites even if topic doesn't match exactly
   */
  async findDatabaseMatches(params: WebsiteSuggestionParams): Promise<WebsiteSuggestion[]> {
    // Strategy 1: Try to find websites matching both websiteTypes and onderwerp
    const query: Filter<BronWebsiteDocument> = {};

    if (params.websiteTypes.length > 0) {
      query.website_types = { $in: params.websiteTypes };
    }

    // Also search by text if onderwerp is provided
    if (params.onderwerp) {
      query.$or = [
        { titel: { $regex: params.onderwerp, $options: 'i' } },
        { samenvatting: { $regex: params.onderwerp, $options: 'i' } }
      ];
    }

    let websites = await this.db
      .collection<BronWebsiteDocument>('bronwebsites')
      .find(query)
      .limit(100)
      .toArray();

    // Strategy 2: If no matches found and onderwerp was used, try without onderwerp filter
    // This finds relevant government websites even if topic doesn't match exactly
    if (websites.length === 0 && params.onderwerp && params.websiteTypes.length > 0) {
      logger.debug(
        { onderwerp: params.onderwerp, websiteTypes: params.websiteTypes },
        'No exact matches found, trying broader search (websiteTypes only)'
      );
      
      const broaderQuery: Filter<BronWebsiteDocument> = {
        website_types: { $in: params.websiteTypes }
      };
      
      const broaderMatches = await this.db
        .collection<BronWebsiteDocument>('bronwebsites')
        .find(broaderQuery)
        .limit(50) // Limit to avoid too many results
        .toArray();
      
      if (broaderMatches.length > 0) {
        logger.info(
          { count: broaderMatches.length, websiteTypes: params.websiteTypes },
          'Found websites using broader search (websiteTypes only)'
        );
        websites = broaderMatches;
      }
    }

    // Strategy 3: If still no matches and we have websiteTypes, try finding any government websites
    // This is a last resort to ensure we have some suggestions
    if (websites.length === 0 && params.websiteTypes.length > 0) {
      logger.debug(
        { websiteTypes: params.websiteTypes },
        'No matches with websiteTypes, trying to find any government websites'
      );
      
      // Look for common government website patterns
      const commonPatterns = [
        'rijksoverheid.nl',
        'overheid.nl',
        'officielebekendmakingen.nl',
        'tweedekamer.nl',
        'provincie',
        'waterschap',
        'gemeente'
      ];
      
      const patternQuery: Filter<BronWebsiteDocument> = {
        $or: commonPatterns.map(pattern => ({
          url: { $regex: pattern, $options: 'i' }
        }))
      };
      
      const patternMatches = await this.db
        .collection<BronWebsiteDocument>('bronwebsites')
        .find(patternQuery)
        .limit(20)
        .toArray();
      
      if (patternMatches.length > 0) {
        logger.info(
          { count: patternMatches.length },
          'Found websites using common government patterns'
        );
        websites = patternMatches;
      }
    }

    return websites.map((w) => ({
      titel: w.titel || 'Untitled',
      url: w.url || '',
      samenvatting: w.samenvatting || '',
      website_types: w.website_types || [],
      relevantie: 'From database'
    }));
  }

  /**
   * Merge AI-generated suggestions with database matches
   */
  mergeWithDatabaseMatches(
    aiSuggestions: WebsiteSuggestion[],
    dbMatches: WebsiteSuggestion[]
  ): WebsiteSuggestion[] {
    const merged: WebsiteSuggestion[] = [...aiSuggestions];
    const seenUrls = new Set(aiSuggestions.map(w => w.url.toLowerCase()));

    for (const dbMatch of dbMatches) {
      if (!seenUrls.has(dbMatch.url.toLowerCase())) {
        merged.push(dbMatch);
        seenUrls.add(dbMatch.url.toLowerCase());
      }
    }

    return merged;
  }

  /**
   * Get hardcoded municipality website suggestion if municipality is selected
   *
   * First tries to look up the municipality in MongoDB (gemeenten collection),
   * falls back to URL construction if not found.
   *
   * @param params - Website suggestion parameters
   * @returns Municipality website suggestion or null if not applicable
   */
  async getMunicipalityWebsiteSuggestion(params: WebsiteSuggestionParams): Promise<WebsiteSuggestion | null> {
    // Only add if municipality (Gemeente) is selected and municipality name is provided
    // Check both overheidstype (can be "Gemeente" or "gemeente") and websiteTypes
    const isGemeenteSelected =
      (params.overheidstype && params.overheidstype.toLowerCase() === 'gemeente') ||
      params.websiteTypes.includes('gemeente');

    if (!isGemeenteSelected) {
      return null;
    }

    if (!params.overheidsinstantie) {
      return null;
    }

    // Normalize municipality name: remove "Gemeente" prefix if present
    let municipalityName = params.overheidsinstantie.trim();

    // Remove "Gemeente" prefix if present (case-insensitive)
    const gemeentePrefix = /^gemeente\s+/i;
    if (gemeentePrefix.test(municipalityName)) {
      municipalityName = municipalityName.replace(gemeentePrefix, '').trim();
    }

    if (!municipalityName) {
      return null;
    }

    // Try to find municipality in MongoDB collection (if available)
    try {
      const gemeentenCollection = this.db.collection('gemeenten');

      // Use improved matching query that handles variations and aliases
      const query = createMunicipalityNameQuery(municipalityName);
      const gemeente = await gemeentenCollection.findOne(query);

      if (gemeente && gemeente.website) {
        const municipalityTitle = municipalityName.startsWith('Gemeente ')
          ? municipalityName
          : `Gemeente ${municipalityName}`;

        return {
          titel: municipalityTitle,
          url: gemeente.website,
          samenvatting: `Officiële website van ${municipalityTitle} met beleidsdocumenten en informatie.`,
          website_types: ['gemeente'],
          relevantie: 'Website van de gemeente - bevat relevante beleidsdocumenten'
        };
      }
    } catch (error) {
      // If collection doesn't exist or query fails, fall back to URL construction
      logger.debug({ error, municipalityName }, 'Could not lookup municipality in database, using URL construction');
    }

    // Fallback: Construct URL from municipality name
    // Convert municipality name to URL-friendly format
    // Examples: "Amsterdam" -> "amsterdam", "Den Haag" -> "denhaag", "Horst aan de Maas" -> "horstaandemaas"
    const urlFriendlyName = municipalityName
      .toLowerCase()
      .replace(/\s+/g, '') // Remove all spaces
      .replace(/[^a-z0-9-]/g, '') // Remove special characters except hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    if (!urlFriendlyName) {
      return null;
    }

    // Construct municipality website URL
    const municipalityUrl = `https://www.${urlFriendlyName}.nl`;
    const municipalityTitle = municipalityName.startsWith('Gemeente ')
      ? municipalityName
      : `Gemeente ${municipalityName}`;

    return {
      titel: municipalityTitle,
      url: municipalityUrl,
      samenvatting: `Officiële website van ${municipalityTitle} met beleidsdocumenten en informatie.`,
      website_types: ['gemeente'],
      relevantie: 'Hardcoded municipality website - always suggested when municipality is selected'
    };
  }
}
