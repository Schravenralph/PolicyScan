import { ScrapedDocument, DocumentType } from '../../infrastructure/types.js';
import { Cache } from '../../infrastructure/cache.js';

/**
 * Metadata extracted by LLM
 */
export interface LLMExtractedMetadata {
  documentType: DocumentType | null;
  publicationDate: string | null; // ISO format YYYY-MM-DD
  themes: string[];
  issuingAuthority: string | null;
  documentStatus: string | null;
  confidence: number; // 0-1
}

/**
 * Service for extracting metadata using LLM
 * 
 * Uses OpenAI GPT to extract structured metadata from documents
 * with caching, request queuing, and rate limiting to optimize performance
 */
export class LLMMetadataExtractor {
  private openaiClient: {
    chat: {
      completions: {
        create: (params: {
          model: string;
          messages: Array<{ role: string; content: string }>;
          temperature?: number;
          max_tokens?: number;
          response_format?: { type: string };
        }) => Promise<{
          choices: Array<{
            message?: {
              content?: string | null;
            };
          }>;
        }>;
      };
    };
  } | null = null;
  private cache: Cache<LLMExtractedMetadata>;
  private readonly cacheTTL: number;
  private readonly enabled: boolean;
  private readonly provider: string;
  private readonly model: string;
  // Request queue for rate limiting
  private requestQueue: Array<() => Promise<void>> = [];
  private processingQueue: boolean = false;
  private readonly maxConcurrentRequests: number;
  private activeRequests: number = 0;
  // Performance metrics
  private requestCount: number = 0;
  private totalLatency: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor() {
    this.enabled = process.env.METADATA_EXTRACTION_LLM_ENABLED === 'true';
    this.provider = process.env.METADATA_LLM_PROVIDER || 'openai';
    this.model = process.env.METADATA_LLM_MODEL || 'gpt-4o-mini';
    const parsedCacheTTL = parseInt(process.env.METADATA_LLM_CACHE_TTL || '2592000', 10);
    this.cacheTTL = (isNaN(parsedCacheTTL) || parsedCacheTTL <= 0 ? 2592000 : parsedCacheTTL) * 1000; // Convert to ms
    const parsedMaxConcurrent = parseInt(process.env.METADATA_LLM_MAX_CONCURRENT || '5', 10);
    this.maxConcurrentRequests = isNaN(parsedMaxConcurrent) || parsedMaxConcurrent <= 0 ? 5 : parsedMaxConcurrent;
    
    // Use shared Cache service with appropriate size and TTL
    const parsedCacheSize = parseInt(process.env.METADATA_LLM_CACHE_SIZE || '1000', 10);
    const validCacheSize = isNaN(parsedCacheSize) || parsedCacheSize <= 0 ? 1000 : parsedCacheSize;
    this.cache = new Cache<LLMExtractedMetadata>(
      validCacheSize,
      this.cacheTTL
    );
  }

  /**
   * Check if LLM extraction is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Extract metadata using LLM
   * Uses cache and request queuing for optimal performance
   */
  async extractMetadata(document: ScrapedDocument): Promise<LLMExtractedMetadata | null> {
    if (!this.enabled) {
      return null;
    }

    // Check cache first (using Cache service)
    const cacheKey = this.getCacheKey(document);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return cached;
    }

    this.cacheMisses++;

    // Queue request to respect rate limits
    return new Promise((resolve) => {
      this.requestQueue.push(async () => {
        const startTime = Date.now();
        try {
          const metadata = await this.extractWithLLM(document);
          
          // Cache result if successful
          if (metadata) {
            await this.cache.set(cacheKey, metadata, this.cacheTTL);
          }

          // Track performance
          const latency = Date.now() - startTime;
          this.requestCount++;
          this.totalLatency += latency;

          resolve(metadata);
        } catch (error) {
          console.error('[LLMMetadataExtractor] Error extracting metadata:', error);
          const latency = Date.now() - startTime;
          this.requestCount++;
          this.totalLatency += latency;
          resolve(null);
        }
      });

      // Process queue
      this.processQueue();
    });
  }

  /**
   * Process request queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      if (!request) break;

      this.activeRequests++;
      request().finally(() => {
        this.activeRequests--;
        // Continue processing queue
        if (this.requestQueue.length > 0) {
          this.processQueue();
        } else {
          this.processingQueue = false;
        }
      });
    }

    this.processingQueue = false;
  }

  /**
   * Get cache key for document
   * Uses hash of URL and title for efficient caching
   */
  private getCacheKey(document: ScrapedDocument): string {
    // Defensive check for required fields
    const url = document.url || '';
    const titel = document.titel || '';
    const key = `${url}:${titel}`;
    // Use a shorter key for better cache performance
    return `llm_meta:${Buffer.from(key).toString('base64').slice(0, 100)}`;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    requestCount: number;
    averageLatency: number;
    cacheHitRate: number;
    cacheHits: number;
    cacheMisses: number;
    activeRequests: number;
    queueLength: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      requestCount: this.requestCount,
      averageLatency: this.requestCount > 0 ? this.totalLatency / this.requestCount : 0,
      cacheHitRate: total > 0 ? this.cacheHits / total : 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      activeRequests: this.activeRequests,
      queueLength: this.requestQueue.length
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.requestCount = 0;
    this.totalLatency = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Extract metadata using OpenAI
   */
  private async extractWithLLM(document: ScrapedDocument): Promise<LLMExtractedMetadata | null> {
    if (this.provider !== 'openai') {
      console.warn(`[LLMMetadataExtractor] Provider ${this.provider} not yet implemented`);
      return null;
    }

    if (!this.openaiClient) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn('[LLMMetadataExtractor] OPENAI_API_KEY not set');
        return null;
      }

      // Dynamic import to avoid requiring openai package if not using LLM
      const { default: OpenAI } = await import('openai');
      this.openaiClient = new OpenAI({ apiKey }) as any;
    }

    try {
      // Prepare document text (limit to avoid token limits)
      const titel = document.titel || '';
      const samenvatting = document.samenvatting || '';
      const documentText = `${titel}\n\n${samenvatting}`.slice(0, 2000);

      // Enhanced prompt with few-shot examples and Dutch context
      const prompt = this.buildEnhancedPrompt(documentText);

      if (!this.openaiClient) {
        return null;
      }
      const response = await this.openaiClient.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content);
      
      return {
        documentType: parsed.documentType || null,
        publicationDate: parsed.publicationDate || null,
        themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 5) : [],
        issuingAuthority: parsed.issuingAuthority || null,
        documentStatus: parsed.documentStatus || null,
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7
      };
    } catch (error) {
      console.error('[LLMMetadataExtractor] Error calling OpenAI:', error);
      return null;
    }
  }

  /**
   * Build enhanced system prompt with context about Dutch policy documents
   */
  private buildSystemPrompt(): string {
    return `You are an expert metadata extraction assistant specialized in Dutch policy documents. 
Your task is to extract structured metadata from Dutch government documents (municipal, provincial, and national level).

Key guidelines:
- You understand Dutch language, government structure, and policy document types
- You recognize common Dutch date formats (DD-MM-YYYY, DD/MM/YYYY, "januari 2024", etc.)
- You understand IMBOR (Informatie Model Beheer Openbare Ruimte) themes and terminology
- You are precise and conservative: return null when information is truly ambiguous
- You provide confidence scores based on clarity of information
- You respond with ONLY valid JSON, no explanatory text

Document types in Dutch policy context:
- Omgevingsvisie: Strategic vision document for spatial planning
- Omgevingsplan: Zoning/land-use plan (municipal level)
- Bestemmingsplan: Detailed zoning plan
- Structuurvisie: Structure vision/plan
- Beleidsregel: Policy rule/regulation
- Beleidsnota: Policy note/memorandum
- Verordening: Municipal ordinance/by-law
- Visiedocument: Vision document
- Rapport: Report
- Besluit: Decision/decree
- Beleidsdocument: General policy document
- Webpagina: Web page (generic)
- PDF: PDF document (when type is unclear)

Common themes in Dutch spatial planning:
wonen, mobiliteit, ruimtelijke ordening, water, milieu, bodem, geluid, externe veiligheid, energie, natuur, klimaat, duurzaamheid, bouwen, verkeer, openbare ruimte`;
  }

  /**
   * Build enhanced prompt with few-shot examples and domain-specific context
   */
  private buildEnhancedPrompt(documentText: string): string {
    return `Extract structured metadata from this Dutch policy document. Use the examples below as guidance.

## Examples:

Example 1 - Clear policy document:
Input: "Omgevingsvisie 2040 - Gemeente Amsterdam\n\nDe gemeente Amsterdam heeft een nieuwe omgevingsvisie vastgesteld op 15 maart 2024. Dit document beschrijft de ruimtelijke ontwikkelingen voor de komende jaren, met focus op wonen, mobiliteit en duurzaamheid."
Output: {
  "documentType": "Omgevingsvisie",
  "publicationDate": "2024-03-15",
  "themes": ["wonen", "mobiliteit", "duurzaamheid"],
  "issuingAuthority": "Gemeente Amsterdam",
  "documentStatus": "final",
  "confidence": 0.95
}

Example 2 - Ambiguous document:
Input: "Beleidsnotitie over waterkwaliteit\n\nDe provincie Noord-Holland heeft aandacht voor waterkwaliteit in het oppervlaktewater. Document uit 2023."
Output: {
  "documentType": "Beleidsnota",
  "publicationDate": "2023-01-01",
  "themes": ["water"],
  "issuingAuthority": "Provincie Noord-Holland",
  "documentStatus": null,
  "confidence": 0.75
}

Example 3 - Document with multiple dates:
Input: "Verordening ruimtelijke ordening\n\nDeze verordening is opgesteld in 2022, goedgekeurd op 1 januari 2023, en gepubliceerd op 15 januari 2023. Het betreft regels voor bouwen en wonen."
Output: {
  "documentType": "Verordening",
  "publicationDate": "2023-01-15",
  "themes": ["bouwen", "wonen"],
  "issuingAuthority": null,
  "documentStatus": "final",
  "confidence": 0.9
}

Example 4 - Incomplete information:
Input: "Beleidsdocument over mobiliteit\n\nDit document beschrijft mobiliteitsbeleid."
Output: {
  "documentType": "Beleidsdocument",
  "publicationDate": null,
  "themes": ["mobiliteit"],
  "issuingAuthority": null,
  "documentStatus": null,
  "confidence": 0.6
}

## Instructions:

1. **Document Type**: Choose the most specific type. If unclear, use "Beleidsdocument" or "Webpagina". Return null only if completely unidentifiable.

2. **Publication Date**: 
   - Prefer the actual publication date over draft/approval dates
   - Convert Dutch dates: "15 maart 2024" → "2024-03-15", "1 januari 2023" → "2023-01-01"
   - Handle formats: DD-MM-YYYY, DD/MM/YYYY, "januari 2024" (use 1st of month), "2024" (use 2024-01-01)
   - If multiple dates exist, choose the publication date
   - Return null if no date information is found

3. **Themes**: 
   - Extract up to 5 most relevant themes
   - Use common Dutch spatial planning themes (wonen, mobiliteit, water, milieu, etc.)
   - Prefer specific themes over generic ones
   - Return empty array if no themes can be identified

4. **Issuing Authority**:
   - Extract municipality name (e.g., "Gemeente Amsterdam")
   - Extract province name (e.g., "Provincie Noord-Holland")
   - Extract national authority (e.g., "Rijksoverheid")
   - Return null if not identifiable

5. **Document Status**:
   - "final" for published/approved documents
   - "draft" for draft/concept documents
   - "archived" for old/archived documents
   - Return null if unclear

6. **Confidence**: 
   - 0.9-1.0: Very clear information
   - 0.7-0.9: Mostly clear with minor ambiguity
   - 0.5-0.7: Some ambiguity or missing information
   - 0.3-0.5: Significant ambiguity
   - < 0.3: Very uncertain

## Document to analyze:

${documentText}

Respond with ONLY valid JSON matching the structure shown in examples.`;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Extract metadata for multiple documents in batch
   * Processes in parallel (up to maxConcurrentRequests) for better throughput
   */
  async extractMetadataBatch(documents: ScrapedDocument[]): Promise<Array<LLMExtractedMetadata | null>> {
    return Promise.all(documents.map(doc => this.extractMetadata(doc)));
  }
}
