import { WebsiteSuggestion, WebsiteSuggestionParams } from '../types.js';

export class MockSuggestionService {
  /**
   * Get mock website suggestions for development/testing when API keys are not configured
   */
  getMockSuggestions(params: WebsiteSuggestionParams): WebsiteSuggestion[] {
    const baseSuggestions: WebsiteSuggestion[] = [];

    // Add suggestions based on government type
    if (params.websiteTypes.includes('gemeente')) {
      if (params.overheidsinstantie) {
        // Add specific gemeente website
        const gemeenteName = params.overheidsinstantie.toLowerCase().replace(/\s+/g, '');
        baseSuggestions.push({
          titel: `Gemeente ${params.overheidsinstantie}`,
          url: `https://www.${gemeenteName}.nl`,
          samenvatting: `Officiële website van Gemeente ${params.overheidsinstantie} met beleidsdocumenten en informatie.`,
          website_types: ['gemeente'],
          relevantie: 'Mock suggestion - development mode'
        });
      }
      // Add some common gemeente websites
      baseSuggestions.push(
        {
          titel: 'Gemeente Amsterdam',
          url: 'https://www.amsterdam.nl',
          samenvatting: 'Officiële website van de gemeente Amsterdam met beleidsdocumenten.',
          website_types: ['gemeente'],
          relevantie: 'Mock suggestion - development mode'
        },
        {
          titel: 'Gemeente Utrecht',
          url: 'https://www.utrecht.nl',
          samenvatting: 'Officiële website van de gemeente Utrecht met beleidsdocumenten.',
          website_types: ['gemeente'],
          relevantie: 'Mock suggestion - development mode'
        }
      );
    }

    if (params.websiteTypes.includes('provincie')) {
      baseSuggestions.push({
        titel: 'Provincie Noord-Holland',
        url: 'https://www.noord-holland.nl',
        samenvatting: 'Officiële website van de provincie Noord-Holland.',
        website_types: ['provincie'],
        relevantie: 'Mock suggestion - development mode'
      });
    }

    if (params.websiteTypes.includes('rijk')) {
      baseSuggestions.push(
        {
          titel: 'Rijksoverheid',
          url: 'https://www.rijksoverheid.nl',
          samenvatting: 'Officiële website van de Rijksoverheid met beleidsdocumenten en regelgeving.',
          website_types: ['rijk'],
          relevantie: 'Mock suggestion - development mode'
        },
        {
          titel: 'Kadaster',
          url: 'https://www.kadaster.nl',
          samenvatting: 'Officiële website van het Kadaster met informatie over ruimtelijke ordening.',
          website_types: ['rijk'],
          relevantie: 'Mock suggestion - development mode'
        }
      );
    }

    // Filter by topic if provided
    if (params.onderwerp) {
      return baseSuggestions.map(s => ({
        ...s,
        samenvatting: `${s.samenvatting} Relevante informatie over: ${params.onderwerp}.`
      }));
    }

    return baseSuggestions;
  }
}
