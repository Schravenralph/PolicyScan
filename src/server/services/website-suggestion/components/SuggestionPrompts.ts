import { WebsiteSuggestionParams } from '../types.js';
import { getGovernmentDomains } from './utils.js';
import type { ScrapedDocument } from '../../infrastructure/types.js';

export class SuggestionPrompts {
  /**
   * Build prompt for knowledge base fallback when web searches fail
   *
   * CRITICAL: This prompt must be very strict to prevent ChatGPT from making up websites.
   * Only suggest well-known, verified government websites.
   */
  buildKnowledgeBasePrompt(params: WebsiteSuggestionParams): string {
    const knownDomains = getGovernmentDomains(params.websiteTypes);
    const websiteTypesText = params.websiteTypes.length > 0 ? params.websiteTypes.join(', ') : 'Not specified';

    // Build list of known valid domains to guide ChatGPT
    const knownDomainsList = knownDomains.length > 0
      ? `\n\nKnown valid government domains for this query:\n${knownDomains.map(d => `- ${d}`).join('\n')}\n\nYou may suggest these domains or other well-known official government websites (e.g., rijksoverheid.nl, overheid.nl).`
      : '\n\nSuggest well-known official government websites (e.g., rijksoverheid.nl, overheid.nl, or municipality websites following standard patterns like [municipality-name].nl).';

    return `INSTRUCTIONS:
- Suggest relevant official Dutch government websites based on your knowledge
- Prioritize well-known government websites (rijksoverheid.nl, overheid.nl, municipality websites)
- You may suggest standard government domain patterns you know are commonly used (e.g., [municipality-name].nl)
- DO NOT invent completely new or unusual domains
- If the topic is very specific and you cannot think of relevant government websites, you may return an empty array

Based on your knowledge of Dutch government structure, suggest relevant official government websites for:

Topic: ${params.onderwerp || 'Not specified'}
Government Type: ${params.overheidstype || 'Not specified'}
Government Instance: ${params.overheidsinstantie || 'Not specified'}
Website Types: ${websiteTypesText}

${knownDomainsList}

Examples of VALID websites you can suggest:
- For municipalities: Standard municipality websites like [municipality-name].nl (e.g., amsterdam.nl, rotterdam.nl, denhaag.nl)
- For national topics: rijksoverheid.nl, overheid.nl, officielebekendmakingen.nl, tweedekamer.nl
- For provinces: Standard province websites like [province-name].nl (e.g., noord-holland.nl, zuid-holland.nl)
- For specific topics: Relevant government agencies or departments (e.g., rvo.nl for energy, ienw.nl for infrastructure)

You can suggest websites based on:
- Well-known government websites you know exist
- Standard Dutch government domain patterns ([name].nl for municipalities/provinces)
- Relevant government agencies for the topic

DO NOT suggest:
- Completely invented or unusual domains
- Non-government websites
- Commercial or private organization websites

Return as JSON object with "websites" array. Each website must have:
- titel: Official website name
- url: Full URL (should be a standard .nl government domain following common patterns)
- samenvatting: Brief explanation of why this website is relevant
- website_types: Array of types (e.g., ["gemeente"], ["provincie"], ["rijk"])
- relevantie: Detailed explanation of relevance to the topic

If you cannot think of any relevant government websites for this topic, return: {"websites": []}

Format: {"websites": [{"titel": "...", "url": "...", "samenvatting": "...", "website_types": ["..."], "relevantie": "..."}]}`;
  }

  /**
   * Build prompt for AI-guided web search using function calling
   *
   * The model will use the web_search function to find relevant websites.
   * It can request multiple searches in parallel with different queries.
   */
  buildWebSearchPrompt(params: WebsiteSuggestionParams): string {
    const domainHints = getGovernmentDomains(params.websiteTypes);
    const websiteTypesText = params.websiteTypes.length > 0 ? params.websiteTypes.join(', ') : 'Not specified';
    const preferredDomains = domainHints.length > 0
      ? domainHints.join(', ')
      : 'official Dutch government domains (.nl)';

    return [
      'You are a Dutch policy web-research agent. Use the web_search tool repeatedly to discover official government websites that contain policy documents for the user.',
      '',
      `Topic: ${params.onderwerp || 'Not specified'}`,
      `Government Type: ${params.overheidstype || 'Not specified'}`,
      `Government Instance: ${params.overheidsinstantie || 'Not specified'}`,
      `Requested Website Types: ${websiteTypesText}`,
      `Preferred Domains: ${preferredDomains}`,
      '',
      'Research strategy:',
      '- Draft 3-5 distinct Dutch queries that cover synonyms, abbreviations, and policy terminology (e.g., beleid, verordening, vergunningen, pdf).',
      '- Always call web_search for each query, even if you think you already know good sources.',
      '- Use site restrictions with the preferred domains when possible; avoid news, blogs, vendors, and commercial sites.',
      '- Prioritize official, authoritative sources (.nl government and related bodies).',
      '- If web searches return no results, use your knowledge of Dutch government structure to suggest relevant official websites.',
      '',
      'Quality rules:',
      '- Include every site that is clearly relevant; do not cap the count.',
      '- Deduplicate by domain; keep the most specific URLs that contain policy documents or forms.',
      '- Skip sources that lack policy content or are purely informational/marketing.',
      '- When web searches fail, suggest websites based on your knowledge (e.g., municipality websites, rijksoverheid.nl, etc.).',
      '',
      'Return a JSON object with "websites": [{ "titel", "url", "samenvatting", "website_types", "relevantie" }].',
      'Summaries should be 1-2 sentences, and relevantie must explain why the site helps answer the topic.'
    ].join('\n');
  }

  /**
   * Build prompt for analyzing Google Search results with gpt-4o-mini
   */
  buildGoogleResultsAnalysisPrompt(params: WebsiteSuggestionParams, results: ScrapedDocument[]): string {
    const resultsList = results.map((doc, idx) =>
      `${idx + 1}. ${doc.titel} (${doc.url})\n   Website: ${doc.website_titel}\n   Summary: ${doc.samenvatting}`
    ).join('\n\n');

    return `Analyze these Google Search results and recommend ALL relevant Dutch government websites for:

Topic: ${params.onderwerp}
Government Type: ${params.overheidstype || 'Not specified'}
Government Instance: ${params.overheidsinstantie || 'Not specified'}
Website Types: ${params.websiteTypes.join(', ')}

Search Results:
${resultsList}

Include ALL websites that are genuinely relevant to the topic. Do not limit the number of recommendations - focus on quality and relevance. Only exclude websites that are clearly not relevant.

For each recommended website, provide:
- title: Website name
- url: Full website URL
- samenvatting: Brief summary explaining why it's relevant
- website_types: Array of types (e.g., ["gemeente"])
- relevantie: Detailed explanation of relevance

Return as JSON object with "websites" array containing ALL relevant recommendations.`;
  }
}
