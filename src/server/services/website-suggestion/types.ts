export interface WebsiteSuggestionParams {
  onderwerp: string;
  overheidstype?: string;
  overheidsinstantie?: string;
  websiteTypes: string[];
}

export interface WebsiteSuggestion {
  titel: string;
  url: string;
  samenvatting: string;
  website_types: string[];
  relevantie?: string;
}

export interface ParsedWebsiteItem {
  titel?: string;
  title?: string;
  name?: string;
  url?: string;
  samenvatting?: string;
  summary?: string;
  description?: string;
  website_types?: string[];
  websiteTypes?: string[];
  relevantie?: string;
  relevance?: string;
  explanation?: string;
}
