import { ScrapedDocument } from '../infrastructure/types.js';
import { SnippetExtractionService } from '../ingestion/snippets/SnippetExtractionService.js';
import { RerankerCache } from './RerankerCache.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import { OpenAIProvider } from '../llm/OpenAIProvider.js';
import { LocalLLMProvider } from '../llm/LocalLLMProvider.js';
import { logger } from '../../utils/logger.js';
import { BadRequestError, ServiceUnavailableError } from '../../types/errors.js';

/**
 * Configuration for the re-ranker service
 */
export interface RerankerConfig {
  provider: 'openai' | 'local' | 'ollama' | 'cohere';
  model?: string;
  topK: number; // Number of top results to re-rank
  enabled: boolean;
  hybridWeight: number; // Weight for hybrid score (0-1)
  rerankerWeight: number; // Weight for re-ranker score (0-1)
  cacheEnabled: boolean;
  cacheTTL: number; // Cache TTL in seconds
  batchSize: number; // Number of documents to process in a single API call
  maxBatchSize: number; // Maximum batch size (API limit)
  fallbackToOpenAI?: boolean; // Fallback to OpenAI if local provider fails
}

/**
 * Result of re-ranking a document
 */
export interface RerankerResult {
  document: ScrapedDocument;
  rerankerScore: number; // Score from LLM re-ranker [0, 1]
  hybridScore: number; // Original hybrid/vector score [0, 1]
  finalScore: number; // Combined score
  explanation?: string; // Explanation for why document ranked high/low
}

/**
 * Service for re-ranking search results using LLM
 * 
 * This service implements Issue #2 from docs/improvements/02-llm-reranker.md
 * 
 * How it works:
 * 1. Takes top N results from hybrid retrieval (vector + keyword search)
 * 2. Extracts relevant snippets from each document
 * 3. Uses LLM (OpenAI) to score how well each document answers the query
 * 4. LLM generates explanations for why documents ranked high/low
 * 5. Combines hybrid score with re-ranker score for final ranking
 * 6. Caches results to avoid redundant API calls
 * 
 * Triggering:
 * - The re-ranker is automatically triggered in the `score_documents` workflow action
 * - It only processes the top N documents (default: 20) to keep costs low
 * - Set RERANKER_ENABLED=true in environment to enable
 * 
 * Testing:
 * - Set RERANKER_ENABLED=true and RERANKER_PROVIDER=openai
 * - Set OPENAI_API_KEY in environment (or use local provider with Ollama)
 * - For local provider: Set RERANKER_PROVIDER=ollama and ensure Ollama is running
 * - Run a workflow with a query (e.g., "arbeidsmigranten")
 * - Check logs for re-ranker activity
 * - Compare document order before/after re-ranking
 */
export class RerankerService {
  private config: RerankerConfig;
  private snippetExtractor: SnippetExtractionService;
  private cache: RerankerCache | null;
  private llmProvider: LLMProvider | null = null;
  private fallbackProvider: LLMProvider | null = null;

  constructor(config?: Partial<RerankerConfig>) {
    // Load configuration from environment or use defaults
    this.config = {
      provider: (process.env.RERANKER_PROVIDER as 'openai' | 'local' | 'ollama' | 'cohere') || 'openai',
      model: process.env.RERANKER_MODEL || 'gpt-4o-mini',
      topK: parseInt(process.env.RERANKER_TOP_K || '20', 10),
      enabled: process.env.RERANKER_ENABLED === 'true',
      hybridWeight: parseFloat(process.env.RERANKER_HYBRID_WEIGHT || '0.6'),
      rerankerWeight: parseFloat(process.env.RERANKER_SCORE_WEIGHT || '0.4'),
      cacheEnabled: process.env.RERANKER_CACHE_ENABLED !== 'false',
      cacheTTL: parseInt(process.env.RERANKER_CACHE_TTL || '604800', 10), // 7 days
      batchSize: parseInt(process.env.RERANKER_BATCH_SIZE || '5', 10), // Default: 5 documents per batch
      maxBatchSize: parseInt(process.env.RERANKER_MAX_BATCH_SIZE || '10', 10), // Default: 10 max
      fallbackToOpenAI: process.env.RERANKER_FALLBACK_TO_OPENAI !== 'false', // Default: true
      ...config
    };

    // Normalize provider name (local -> ollama for consistency)
    if (this.config.provider === 'local') {
      this.config.provider = 'ollama';
    }

    // Validate weights sum to 1.0
    const sum = this.config.hybridWeight + this.config.rerankerWeight;
    if (Math.abs(sum - 1.0) > 0.001) {
      logger.warn({ sum }, 'Reranker weights sum to {sum}, normalizing to 1.0');
      this.config.hybridWeight /= sum;
      this.config.rerankerWeight /= sum;
    }

    this.snippetExtractor = new SnippetExtractionService(500); // 500 token limit
    this.cache = this.config.cacheEnabled ? new RerankerCache(this.config.cacheTTL) : null;

    // Initialize LLM provider
    this.initializeProvider();
  }

  /**
   * Check if Ollama provider is available, disable reranker if not
   * This prevents workflows from failing when Ollama is not configured/running
   * Called lazily on first use to avoid blocking constructor
   */
  private async checkAndDisableIfUnavailable(): Promise<void> {
    if (!this.config.enabled || this.config.provider !== 'ollama') {
      return;
    }

    if (!this.llmProvider || !(this.llmProvider instanceof LocalLLMProvider)) {
      return;
    }

    try {
      const available = await this.llmProvider.isAvailable();
      if (!available) {
        const config = this.llmProvider.getConfig();
        logger.warn(
          {
            provider: this.config.provider,
            apiUrl: config?.apiUrl || 'unknown',
          },
          'Reranker enabled but Ollama provider is unavailable. Disabling reranker to prevent workflow failures.'
        );
        this.config.enabled = false;
      }
    } catch (error) {
      logger.warn(
        { error, provider: this.config.provider },
        'Failed to check Ollama availability. Disabling reranker to prevent workflow failures.'
      );
      this.config.enabled = false;
    }
  }

  /**
   * Initialize the LLM provider based on configuration
   */
  private initializeProvider(): void {
    try {
      switch (this.config.provider) {
        case 'openai':
          this.llmProvider = new OpenAIProvider({
            defaultModel: this.config.model,
          });
          break;
        case 'ollama':
        case 'local':
          this.llmProvider = new LocalLLMProvider({
            model: this.config.model || 'llama2',
          });
          // Set up OpenAI as fallback if configured
          if (this.config.fallbackToOpenAI) {
            this.fallbackProvider = new OpenAIProvider({
              defaultModel: 'gpt-4o-mini',
            });
          }
          break;
        case 'cohere':
          throw new BadRequestError('Cohere provider not yet implemented', {
            reason: 'provider_not_implemented',
            operation: 'constructor',
            provider: 'cohere'
          });
        default:
          throw new BadRequestError(`Unknown re-ranker provider: ${this.config.provider}`, {
            reason: 'unknown_provider',
            operation: 'constructor',
            provider: this.config.provider,
            validProviders: ['openai', 'local', 'ollama', 'cohere']
          });
      }

      logger.info({ provider: this.config.provider, model: this.config.model }, 'Initialized LLM provider for reranker');
    } catch (error) {
      logger.error({ error, provider: this.config.provider }, 'Failed to initialize LLM provider');
      // Fallback to OpenAI if local provider fails to initialize
      if (this.config.provider !== 'openai' && this.config.fallbackToOpenAI) {
        logger.warn('Falling back to OpenAI provider');
        this.llmProvider = new OpenAIProvider({ defaultModel: 'gpt-4o-mini' });
      }
    }
  }

  /**
   * Get the active LLM provider, with fallback if primary fails
   */
  private async getProvider(): Promise<LLMProvider> {
    if (!this.llmProvider) {
      throw new ServiceUnavailableError('No LLM provider initialized', {
        reason: 'llm_provider_not_initialized',
        operation: 'getProvider',
        config: this.config
      });
    }

    // Check if primary provider is available
    const isAvailable = await this.llmProvider.isAvailable();
    if (isAvailable) {
      return this.llmProvider;
    }

    // Try fallback provider if available
    if (this.fallbackProvider) {
      const fallbackAvailable = await this.fallbackProvider.isAvailable();
      if (fallbackAvailable) {
        logger.warn({ primaryProvider: this.llmProvider.getName(), fallbackProvider: this.fallbackProvider.getName() }, 'Primary provider unavailable, using fallback');
        return this.fallbackProvider;
      }
    }

    throw new ServiceUnavailableError(`LLM provider ${this.llmProvider.getName()} is not available and no fallback is available`, {
      reason: 'llm_provider_unavailable',
      operation: 'getProvider',
      providerName: this.llmProvider.getName(),
      config: this.config
    });
  }

  /**
   * Re-rank documents using LLM
   * 
   * @param documents Documents to re-rank (should already be sorted by hybrid score)
   * @param query The search query
   * @returns Re-ranked documents with combined scores
   * 
   * Process:
   * 1. Take top N documents (default: 20)
   * 2. Extract snippets for each document
   * 3. Get re-ranker scores (from cache or LLM)
   * 4. Combine hybrid scores with re-ranker scores
   * 5. Re-sort by final score
   */
  async rerank(
    documents: Array<ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }>,
    query: string
  ): Promise<RerankerResult[]> {
    console.error('[RERANKER] rerank() called - enabled:', this.config.enabled, 'provider:', this.config.provider, 'documents:', documents.length);
    // Check if Ollama is available and disable if not (lazy check on first use)
    if (this.config.enabled && this.config.provider === 'ollama') {
      await this.checkAndDisableIfUnavailable();
    }

    if (!this.config.enabled) {
      console.error('[RERANKER] rerank() - DISABLED, returning early with rerankerScore=0');
      // If disabled, return documents with original scores
      return documents.map(doc => ({
        document: doc,
        rerankerScore: 0,
        hybridScore: this.getHybridScore(doc),
        finalScore: this.getHybridScore(doc)
      }));
    }
    console.error('[RERANKER] rerank() - ENABLED, proceeding');

    // Only re-rank top N documents
    const topDocuments = documents.slice(0, this.config.topK);
    
    // Re-rank documents using batch processing
    const results: RerankerResult[] = [];
    
    // Separate cached and uncached documents
    const uncachedDocs: Array<ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }> = [];
    const cachedResults: Map<string, { score: number; explanation?: string }> = new Map();
    
    for (const doc of topDocuments) {
      // When cache is null, this.cache?.getCachedScore() returns undefined (optional chaining)
      const cachedScore = this.cache?.getCachedScore(query, doc.url);
      // Use console.log instead of console.error to avoid Vitest suppression
      console.log('[RERANKER] Checking cache for doc:', doc.url.substring(0, 50), 'cache exists:', !!this.cache, 'cachedScore:', cachedScore, 'type:', typeof cachedScore);
      
      if (cachedScore !== null && cachedScore !== undefined) {
        cachedResults.set(doc.url, { score: cachedScore });
        console.log('[RERANKER] Doc found in cache, score:', cachedScore);
      } else {
        uncachedDocs.push(doc);
        console.log('[RERANKER] Doc NOT in cache (cachedScore is', cachedScore, '), added to uncachedDocs. uncachedDocs.length now:', uncachedDocs.length);
      }
    }
    console.log('[RERANKER] After cache check - uncachedDocs.length:', uncachedDocs.length, 'cachedResults.size:', cachedResults.size, 'topDocuments.length:', topDocuments.length);
    
    // Process uncached documents in batches
    console.log('[RERANKER] Checking uncachedDocs.length:', uncachedDocs.length);
    if (uncachedDocs.length > 0) {
      console.log('[RERANKER] Processing uncached documents:', uncachedDocs.length, 'cache enabled:', !!this.cache);
      try {
        logger.warn({ uncachedCount: uncachedDocs.length, query, cacheEnabled: !!this.cache }, 'Processing uncached documents in batches');
        const batchResults = await this.processBatch(uncachedDocs, query);
        console.log('[RERANKER] Batch processing completed, results:', batchResults.length);
        logger.warn({ batchResultsCount: batchResults.length, uncachedCount: uncachedDocs.length }, 'Batch processing completed');
        
        if (batchResults.length === 0) {
          logger.warn({ uncachedCount: uncachedDocs.length }, 'processBatch returned empty results');
        }
        
        // Cache the results
        for (const result of batchResults) {
          if (this.cache) {
            this.cache.setCachedScore(query, result.document.url, result.rerankerScore);
          }
          cachedResults.set(result.document.url, {
            score: result.rerankerScore,
            explanation: result.explanation
          });
        }
      } catch (error) {
        // If reranker fails (e.g., LLM provider unavailable, connection refused), 
        // fall back to using hybrid scores only
        console.log('[RERANKER] processBatch FAILED with error:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error) {
          console.log('[RERANKER] Error stack:', error.stack);
        }
        logger.warn(
          { 
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            documentCount: uncachedDocs.length 
          }, 
          'Reranker batch processing failed, using hybrid scores only'
        );
        // Continue with cached results only - uncached docs will use default score of 0.5
      }
    }
    
    // Combine all results
    for (const doc of topDocuments) {
      const hybridScore = this.getHybridScore(doc);
      const cached = cachedResults.get(doc.url);
      
      const rerankerScore = cached?.score ?? 0.5;
      const explanation = cached?.explanation;

      // Combine scores
      const finalScore = 
        hybridScore * this.config.hybridWeight +
        rerankerScore * this.config.rerankerWeight;

      results.push({
        document: doc,
        rerankerScore,
        hybridScore,
        finalScore,
        explanation
      });
    }

    // Sort by final score (descending)
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Append remaining documents (beyond topK) with original scores
    const remaining = documents.slice(this.config.topK).map(doc => ({
      document: doc,
      rerankerScore: 0,
      hybridScore: this.getHybridScore(doc),
      finalScore: this.getHybridScore(doc)
    }));

    return [...results, ...remaining];
  }

  /**
   * Get hybrid score from document (vector similarity or relevance score)
   */
  private getHybridScore(doc: ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }): number {
    // Normalize to [0, 1]
    if (doc.semanticSimilarity !== undefined) {
      return Math.max(0, Math.min(1, doc.semanticSimilarity));
    }
    
    if (doc.relevanceScore !== undefined) {
      // Normalize relevance score (typically 0-20) to [0, 1]
      return Math.max(0, Math.min(1, doc.relevanceScore / 20));
    }

    return 0.5; // Default neutral score
  }

  /**
   * Get re-ranker score from LLM
   * @deprecated Use getRerankerScoreWithExplanation instead
   */
  private async getRerankerScore(document: ScrapedDocument, query: string): Promise<number> {
    const result = await this.getRerankerScoreWithExplanation(document, query);
    return result.score;
  }

  /**
   * Process documents in batches for efficient API usage
   */
  private async processBatch(
    documents: Array<ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }>,
    query: string
  ): Promise<RerankerResult[]> {
    const results: RerankerResult[] = [];
    const batchSize = Math.min(this.config.batchSize, this.config.maxBatchSize);
    
    console.error('[RERANKER] processBatch: Starting, documents:', documents.length, 'batchSize:', batchSize);
    logger.debug({ documentCount: documents.length, batchSize }, 'Starting batch processing');
    
    // Get provider
    let provider: LLMProvider | null = null;
    try {
      console.error('[RERANKER] processBatch: Calling getProvider()...');
      provider = await this.getProvider();
      console.error('[RERANKER] processBatch: getProvider() succeeded, provider:', provider.getName());
    } catch (error) {
      console.error('[RERANKER] processBatch: getProvider() FAILED with error:', error instanceof Error ? error.message : String(error));
      if (error instanceof Error) {
        console.error('[RERANKER] processBatch: Error stack:', error.stack);
      }
      logger.warn('No LLM provider available for re-ranking');
      return results;
    }
    
    // Process documents in batches
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      try {
        logger.debug({ batchIndex: i / batchSize + 1, batchSize: batch.length }, 'Processing batch');
        const batchResults = await this.processBatchWithProvider(batch, query);
        logger.debug({ batchResultsCount: batchResults.length }, 'Batch processed successfully');
        results.push(...batchResults);
      } catch (error) {
        // Handle partial batch failures - process individually as fallback
        logger.warn({ 
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        }, 'Batch processing failed, falling back to individual processing');
        
        for (const doc of batch) {
          try {
            const result = await this.getRerankerScoreWithExplanation(doc, query);
            const hybridScore = this.getHybridScore(doc);
            const finalScore = 
              hybridScore * this.config.hybridWeight +
              result.score * this.config.rerankerWeight;
            
            results.push({
              document: doc,
              rerankerScore: result.score,
              hybridScore,
              finalScore,
              explanation: result.explanation
            });
          } catch (individualError) {
            // If individual processing also fails, use default score
            logger.error({ error: individualError, url: doc.url }, 'Failed to process document');
            const hybridScore = this.getHybridScore(doc);
            results.push({
              document: doc,
              rerankerScore: 0.5,
              hybridScore,
              finalScore: hybridScore * this.config.hybridWeight + 0.5 * this.config.rerankerWeight,
              explanation: 'Fout bij het verwerken van dit document.'
            });
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Process a batch of documents with the configured provider
   */
  private async processBatchWithProvider(
    documents: Array<ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }>,
    query: string
  ): Promise<RerankerResult[]> {
    try {
      const provider = await this.getProvider();
      logger.debug({ providerName: provider.getName() }, 'Using provider for batch processing');
      
      // Extract snippets for all documents
      const documentData = documents.map(doc => ({
        doc,
        snippet: this.snippetExtractor.extractRelevantSnippet(doc, query)
      }));

      // Create batch prompt
      const documentsText = documentData.map(({ doc, snippet }, index) => {
        return `Document ${index + 1}:
Title: ${doc.titel || 'N/A'}
URL: ${doc.url}
Snippet: ${snippet}`;
      }).join('\n\n');

      const prompt = `You are a relevance scorer for Dutch policy documents.
Rate how well each document answers the query on a scale of 0.0 to 1.0 and explain why.

Query: "${query}"

Documents:
${documentsText}

For each document, rate the relevance (0.0 = not relevant, 1.0 = highly relevant). Consider:
- Does the document directly address the query topic?
- Is it a deep discussion or just a passing mention?
- Is the information specific and actionable?
- How relevant is the document to the query context?

Respond in the following JSON format:
{
  "scores": [
    {
      "index": 0,
      "score": 0.75,
      "explanation": "Brief explanation in Dutch of why this document is relevant or not relevant to the query"
    },
    {
      "index": 1,
      "score": 0.60,
      "explanation": "Brief explanation in Dutch..."
    }
  ]
}

The explanations should be concise (1-2 sentences) and in Dutch.`;

      console.log('[RERANKER] Calling provider.generate for batch:', documents.length, 'documents, provider:', provider.getName());
      logger.warn({ documentCount: documents.length, query, providerName: provider.getName() }, 'Calling provider.generate for batch');
      const response = await provider.generate(
        [
          {
            role: 'system',
            content: 'You are a relevance scorer for Dutch policy documents. Respond with JSON containing scores (0.0-1.0) and brief explanations in Dutch for each document.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        {
          model: this.config.model,
          temperature: 0.1, // Low temperature for consistent scoring
          max_tokens: Math.min(200 * documents.length, 2000), // Scale tokens with batch size
        }
      );
      console.log('[RERANKER] Received response from provider, length:', response.content?.length, 'preview:', response.content?.substring(0, 100));
      logger.warn({ responseLength: response.content?.length, responsePreview: response.content?.substring(0, 100) }, 'Received response from provider');

      // Parse JSON response
      try {
        console.log('[RERANKER] Parsing response.content:', response.content?.substring(0, 200));
        const parsed = JSON.parse(response.content);
        console.log('[RERANKER] Parsed JSON:', JSON.stringify(parsed, null, 2));
        const scores = parsed.scores || [];
        console.log('[RERANKER] Scores array length:', scores.length, 'documents.length:', documents.length);
        
        // Map scores to documents
        const results: RerankerResult[] = [];
        
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          const scoreData = scores.find((s: { index: number }) => s.index === i) || 
                           scores[i] || 
                           { score: 0.5, explanation: 'Geen score ontvangen voor dit document.' };
          console.log('[RERANKER] Document', i, 'scoreData:', JSON.stringify(scoreData));
          
          const score = Math.max(0, Math.min(1, parseFloat(scoreData.score) || 0.5));
          console.log('[RERANKER] Document', i, 'final score:', score);
          const explanation = scoreData.explanation?.substring(0, 500) || 'Geen uitleg beschikbaar.';
          
          const hybridScore = this.getHybridScore(doc);
          const finalScore = 
            hybridScore * this.config.hybridWeight +
            score * this.config.rerankerWeight;
          
          results.push({
            document: doc,
            rerankerScore: score,
            hybridScore,
            finalScore,
            explanation
          });
        }
        
        return results;
      } catch (_parseError) {
        logger.warn({ content: response.content }, 'Failed to parse batch response as JSON');
        return this.fallbackToIndividualProcessing(documents, query);
      }
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      }, 'Error processing batch with provider');
      return this.fallbackToIndividualProcessing(documents, query);
    }
  }

  /**
   * Get re-ranker score and explanation from LLM
   */
  private async getRerankerScoreWithExplanation(
    document: ScrapedDocument,
    query: string
  ): Promise<{ score: number; explanation: string }> {
    try {
      const provider = await this.getProvider();

      // Extract snippet for LLM
      const snippet = this.snippetExtractor.extractRelevantSnippet(document, query);

      // Create prompt for relevance scoring with explanation
      const prompt = `You are a relevance scorer for Dutch policy documents. 
Rate how well this document answers the query on a scale of 0.0 to 1.0 and explain why.

Query: "${query}"

Document:
Title: ${document.titel || 'N/A'}
${snippet}

Rate the relevance (0.0 = not relevant, 1.0 = highly relevant). Consider:
- Does the document directly address the query topic?
- Is it a deep discussion or just a passing mention?
- Is the information specific and actionable?
- How relevant is the document to the query context?

Respond in the following JSON format:
{
  "score": 0.75,
  "explanation": "Brief explanation in Dutch of why this document is relevant or not relevant to the query"
}

The explanation should be concise (1-2 sentences) and in Dutch.`;

      const response = await provider.generate(
        [
          {
            role: 'system',
            content: 'You are a relevance scorer for Dutch policy documents. Respond with JSON containing a score (0.0-1.0) and a brief explanation in Dutch.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        {
          model: this.config.model,
          temperature: 0.1, // Low temperature for consistent scoring
          max_tokens: 200, // Need more tokens for explanation
        }
      );

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(response.content);
        const score = parseFloat(parsed.score);
        const explanation = parsed.explanation || 'Geen uitleg beschikbaar.';
        
        if (isNaN(score)) {
          logger.warn({ content: response.content }, 'Failed to parse re-ranker score from JSON');
          return { score: 0.5, explanation: 'Fout bij het parsen van de score.' };
        }

        // Clamp to [0, 1]
        return {
          score: Math.max(0, Math.min(1, score)),
          explanation: explanation.substring(0, 500), // Limit explanation length
        };
      } catch (_parseError) {
        // Fallback: try to extract just the score if JSON parsing fails
        const scoreMatch = response.content.match(/["']?score["']?\s*:\s*([0-9.]+)/);
        if (scoreMatch) {
          const score = parseFloat(scoreMatch[1]);
          if (!isNaN(score)) {
            return {
              score: Math.max(0, Math.min(1, score)),
              explanation: 'Score gegenereerd, maar uitleg kon niet worden geparsed.',
            };
          }
        }
        
        logger.warn({ content: response.content }, 'Failed to parse re-ranker response as JSON');
        return { score: 0.5, explanation: 'Fout bij het verwerken van de LLM-reactie.' };
      }
    } catch (error) {
      logger.error({ error }, 'Error getting re-ranker score with explanation');
      return { score: 0.5, explanation: 'Fout bij het ophalen van de score van de LLM.' };
    }
  }


  /**
   * Fallback to individual processing if batch processing fails
   */
  private async fallbackToIndividualProcessing(
    documents: Array<ScrapedDocument & { relevanceScore?: number; semanticSimilarity?: number }>,
    query: string
  ): Promise<RerankerResult[]> {
    logger.debug({ documentCount: documents.length }, 'Falling back to individual processing');
    const results: RerankerResult[] = [];
    
    for (const doc of documents) {
      try {
        const result = await this.getRerankerScoreWithExplanation(doc, query);
        const hybridScore = this.getHybridScore(doc);
        const finalScore = 
          hybridScore * this.config.hybridWeight +
          result.score * this.config.rerankerWeight;
        
        results.push({
          document: doc,
          rerankerScore: result.score,
          hybridScore,
          finalScore,
          explanation: result.explanation
        });
      } catch (error) {
        logger.error({ error, url: doc.url }, 'Failed to process document');
        const hybridScore = this.getHybridScore(doc);
        results.push({
          document: doc,
          rerankerScore: 0.5,
          hybridScore,
          finalScore: hybridScore * this.config.hybridWeight + 0.5 * this.config.rerankerWeight,
          explanation: 'Fout bij het verwerken van dit document.'
        });
      }
    }
    
    return results;
  }

  /**
   * Get current configuration
   */
  getConfig(): RerankerConfig {
    return { ...this.config };
  }

  /**
   * Check if re-ranker is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttlSeconds: number } | null {
    return this.cache?.getStats() || null;
  }

  /**
   * Check reranker health status
   * Returns health information including availability, error messages, and suggestions
   */
  async checkHealth(): Promise<{
    enabled: boolean;
    provider: string;
    available: boolean;
    apiUrl?: string;
    model?: string;
    error: string | null;
    suggestion: string | null;
  }> {
    const config = this.getConfig();
    let available = false;
    let error: string | null = null;
    let suggestion: string | null = null;
    let apiUrl: string | undefined;

    if (!config.enabled) {
      return {
        enabled: false,
        provider: config.provider,
        available: false,
        error: null,
        suggestion: 'Reranker is disabled. Set RERANKER_ENABLED=true to enable.',
      };
    }

    // Get provider information
    const model = config.model;
    
    try {
      if (this.llmProvider) {
        // Check if provider is available
        available = await this.llmProvider.isAvailable();
        
        // Get API URL if it's a LocalLLMProvider
        if (this.llmProvider instanceof LocalLLMProvider) {
          const providerConfig = this.llmProvider.getConfig();
          apiUrl = providerConfig.apiUrl;
          
          if (!available) {
            error = 'Ollama not available';
            const isDocker = process.env.DOCKER_CONTAINER === 'true';
            suggestion = isDocker
              ? `Verify Ollama is running: curl http://host.docker.internal:11434/api/tags`
              : `Verify Ollama is running: curl http://localhost:11434/api/tags`;
          }
        } else if (this.llmProvider instanceof OpenAIProvider) {
          // For OpenAI, we can't easily get the API URL, but availability check is sufficient
          if (!available) {
            error = 'OpenAI provider not available';
            suggestion = 'Check OPENAI_API_KEY environment variable and API connectivity';
          }
        }
      } else {
        error = 'No LLM provider initialized';
        suggestion = 'Check reranker configuration and provider initialization';
      }
    } catch (err) {
      available = false;
      error = err instanceof Error ? err.message : String(err);
      suggestion = 'Check reranker configuration and service status';
    }

    return {
      enabled: config.enabled,
      provider: config.provider,
      available,
      apiUrl,
      model,
      error,
      suggestion,
    };
  }
}
