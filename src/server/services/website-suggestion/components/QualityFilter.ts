import { logger } from '../../../utils/logger.js';
import { WebsiteSuggestion, WebsiteSuggestionParams } from '../types.js';
import { getGovernmentDomains } from './utils.js';

export class QualityFilter {
  /**
   * Filter websites by quality and relevance
   * Removes duplicates, invalid URLs, and clearly irrelevant websites
   *
   * Improved with logging to track what's being filtered out
   */
  filterByQuality(websites: WebsiteSuggestion[], params: WebsiteSuggestionParams): WebsiteSuggestion[] {
    const filtered: WebsiteSuggestion[] = [];
    const seenUrls = new Set<string>();
    const seenDomains = new Set<string>();

    // Track filtering statistics
    const filterStats = {
      noUrl: 0,
      invalidUrl: 0,
      duplicate: 0,
      noTitle: 0,
      noSummary: 0,
      total: websites.length
    };

    for (const website of websites) {
      // Skip if URL is missing or invalid
      if (!website.url || !website.url.trim()) {
        filterStats.noUrl++;
        continue;
      }

      // Skip if not a valid URL format
      try {
        const url = new URL(website.url.startsWith('http') ? website.url : `https://${website.url}`);
        if (!url.hostname || !url.hostname.includes('.')) {
          filterStats.invalidUrl++;
          continue;
        }
      } catch {
        filterStats.invalidUrl++;
        continue; // Invalid URL
      }

      // Skip duplicates by URL
      const urlKey = website.url.toLowerCase().replace(/\/$/, ''); // Normalize URLs
      if (seenUrls.has(urlKey)) {
        filterStats.duplicate++;
        continue;
      }
      seenUrls.add(urlKey);

      // For domain-level deduplication, keep the first occurrence
      const domain = this.extractDomain(website.url);
      const domainKey = domain.toLowerCase();
      if (seenDomains.has(domainKey)) {
        // If we've seen this domain, only keep if it's more specific (has path)
        const currentUrl = website.url.toLowerCase();
        const existing = filtered.find(w => this.extractDomain(w.url).toLowerCase() === domainKey);
        if (existing) {
          const existingUrl = existing.url.toLowerCase();
          // Keep the one with more specific path, or keep existing if equal
          if (currentUrl.length > existingUrl.length && currentUrl.includes('/')) {
            // Replace existing with more specific URL
            const index = filtered.indexOf(existing);
            filtered[index] = website;
          }
          filterStats.duplicate++;
          continue; // Skip this one
        }
      }
      seenDomains.add(domainKey);

      // Basic relevance check - skip if title/summary is too generic or empty
      if (!website.titel || website.titel.trim().length < 2) {
        filterStats.noTitle++;
        continue;
      }
      if (!website.samenvatting || website.samenvatting.trim().length < 10) {
        // If no summary, at least ensure title is meaningful
        if (website.titel.length < 5) {
          filterStats.noSummary++;
          continue;
        }
      }

      // Validate that URL matches known government domain patterns
      // This helps catch made-up websites from ChatGPT knowledge base
      try {
        const urlObjForValidation = new URL(website.url.startsWith('http') ? website.url : `https://${website.url}`);
        const hostnameForValidation = urlObjForValidation.hostname.toLowerCase().replace(/^www\./, '');

        // Check against known government domains
        const knownDomains = getGovernmentDomains(params.websiteTypes);
        const isKnownDomain = knownDomains.some(d => hostnameForValidation === d || hostnameForValidation.endsWith(`.${d}`));

        // Check common government domain patterns
        const isCommonGovernmentDomain =
          hostnameForValidation === 'rijksoverheid.nl' ||
          hostnameForValidation === 'overheid.nl' ||
          hostnameForValidation === 'officielebekendmakingen.nl' ||
          hostnameForValidation.endsWith('.overheid.nl') ||
          (hostnameForValidation.endsWith('.nl') && (
            hostnameForValidation.includes('gemeente') ||
            hostnameForValidation.includes('provincie') ||
            hostnameForValidation.includes('waterschap') ||
            hostnameForValidation.includes('ministerie')
          ));

        // For municipalities, check if domain matches municipality name pattern
        let isMunicipalityDomain = false;
        if (params.websiteTypes.includes('gemeente') && params.overheidsinstantie) {
          const municipalityName = params.overheidsinstantie.toLowerCase()
            .replace(/^gemeente\s+/i, '')
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9-]/g, '');
          const expectedDomain = `${municipalityName}.nl`;
          isMunicipalityDomain = hostnameForValidation === expectedDomain || hostnameForValidation === `www.${expectedDomain}`;
        }

        // If not a known domain and not a common government domain pattern, filter it out
        // This prevents made-up websites from ChatGPT
        if (!isKnownDomain && !isCommonGovernmentDomain && !isMunicipalityDomain) {
          // If strict validation fails but it looks like a valid .nl domain, log a warning but maybe allow it if we are desperate?
          // For now, keep strict but improve logging.

          logger.warn({
            url: website.url,
            hostname: hostnameForValidation,
            titel: website.titel,
            knownDomainsSample: knownDomains.slice(0, 3),
            isCommonPattern: isCommonGovernmentDomain,
            isMunicipality: isMunicipalityDomain,
            reason: 'URL does not match known government domain patterns - filtered to prevent hallucination'
          }, 'Quality Filter: Rejecting website');
          filterStats.invalidUrl++;
          continue; // Filter out made-up websites
        }
      } catch (urlError) {
        // URL parsing failed, already caught above, but log if we get here
        logger.debug({ url: website.url, error: urlError }, 'URL validation error in domain check');
      }

      filtered.push(website);
    }

    // Log filtering statistics if any websites were filtered out
    if (filterStats.total !== filtered.length) {
      logger.info({
        before: filterStats.total,
        after: filtered.length,
        filtered: filterStats.total - filtered.length,
        reasons: {
          noUrl: filterStats.noUrl,
          invalidUrl: filterStats.invalidUrl,
          duplicate: filterStats.duplicate,
          noTitle: filterStats.noTitle,
          noSummary: filterStats.noSummary
        }
      }, 'Quality filter applied');
    }

    return filtered;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch {
      return url;
    }
  }

}
