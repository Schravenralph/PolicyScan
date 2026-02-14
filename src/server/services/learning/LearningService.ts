/**
 * Learning Service
 * 
 * Uses feedback data to update rankings, dictionaries, and source quality scores.
 * Implements simple boosting mechanisms for ranking adjustments.
 */

import { getDB, ensureDBConnection } from '../../config/database.js';
import type { Db } from '../../config/database.js';
import { FeedbackAnalysisService, QualityMetrics } from '../feedback/FeedbackAnalysisService.js';
import { QueryExpansionService } from '../query/QueryExpansionService.js';
import { DictionaryUpdateService } from '../knowledgeBase/DictionaryUpdateService.js';
import { NavigationPatternLearningService } from './NavigationPatternLearningService.js';
import { PatternApplicationResult, NavigationContext, LearnedPattern } from '../patternLearning/types.js';
import { LearnedPatternDocument } from '../../models/LearnedPattern.js';
import { ObjectId } from 'mongodb';
import { withTimeout, DEFAULT_TIMEOUTS } from '../../utils/withTimeout.js';
import {
  learningOperationDuration,
  learningOperationsTotal,
  learningTimeouts,
  learningMemoryUsage,
  learningCycleResults,
} from '../../utils/metrics.js';

export interface RankingBoost {
  documentId: string;
  boostMultiplier: number;
  reason: string;
}

export interface DictionaryUpdate {
  term: string;
  synonyms: string[];
  dictionary: 'dutch' | 'planning' | 'housing' | 'policy';
  confidence: number;
  source: 'feedback' | 'discovery';
}

export interface SourceUpdate {
  sourceUrl: string;
  qualityScore: number;
  deprecated: boolean;
}

export interface PatternEffectivenessMetrics {
  patternId: string;
  successRate: number;
  totalApplications: number;
  averageMatchScore?: number;
  confidence: number;
  lastUsed?: Date;
  status: 'active' | 'deprecated' | 'experimental';
}

export interface PatternEffectivenessData {
  patternId: string;
  patternType: 'xpath' | 'css' | 'url_pattern' | 'semantic';
  success: boolean;
  matchScore?: number;
  domain: string;
  sourceUrl: string;
  timestamp: Date;
}

export class LearningService {
  private readonly enabled: boolean;
  private readonly clickBoost: number;
  private readonly acceptBoost: number;
  private readonly minFeedbackCount: number;
  private readonly minQualityScore: number;
  private _db: Db | null = null;
  private feedbackAnalysis: FeedbackAnalysisService;
  private queryExpansion?: QueryExpansionService;
  private dictionaryUpdateService: DictionaryUpdateService;
  private patternLearningService?: NavigationPatternLearningService;
  private _patternEffectivenessHistory: PatternEffectivenessData[] = [];
  
  // Concurrent execution protection
  private learningCycleRunning = false;
  private currentCycleOperationId: string | null = null;
  private currentCycleStartTime: Date | null = null;
  private currentCycleStep: string | null = null;
  private lastCycleResult: {
    operationId: string;
    status: 'completed' | 'failed';
    completedAt: Date;
    result?: Awaited<ReturnType<LearningService['runLearningCycle']>>;
    error?: string;
  } | null = null;
  
  // Cancellation support - store active operations with their AbortControllers
  private activeOperations = new Map<string, {
    abortController: AbortController;
    startTime: Date;
    operationType: string;
  }>();

  /**
   * Get database instance (lazy initialization)
   */
  private async getDB(): Promise<Db> {
    if (!this._db) {
      this._db = await ensureDBConnection();
    }
    return this._db;
  }

  /**
   * Track operation metrics (duration, memory, success/failure)
   * Helper function to wrap operations with metrics collection
   */
  private async trackOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    let memoryBefore: NodeJS.MemoryUsage | null = null;
    let memoryAfter: NodeJS.MemoryUsage | null = null;
    let peakMemory: NodeJS.MemoryUsage | null = null;

    try {
      // Record memory before operation
      memoryBefore = process.memoryUsage();
      learningMemoryUsage.set({ operation: operationName, phase: 'before' }, memoryBefore.heapUsed);

      // Execute operation
      const result = await operation();

      // Record memory after operation
      memoryAfter = process.memoryUsage();
      learningMemoryUsage.set({ operation: operationName, phase: 'after' }, memoryAfter.heapUsed);

      // Calculate peak memory (approximation: use after if higher)
      peakMemory = memoryAfter.heapUsed > memoryBefore.heapUsed ? memoryAfter : memoryBefore;
      learningMemoryUsage.set({ operation: operationName, phase: 'peak' }, peakMemory.heapUsed);

      // Record duration
      const duration = (Date.now() - startTime) / 1000;
      learningOperationDuration.observe({ operation: operationName }, duration);

      // Record success
      learningOperationsTotal.inc({ operation: operationName, status: 'success' });

      return result;
    } catch (error) {
      // Record memory after error
      if (!memoryAfter) {
        memoryAfter = process.memoryUsage();
        learningMemoryUsage.set({ operation: operationName, phase: 'after' }, memoryAfter.heapUsed);
      }

      // Record duration even on error
      const duration = (Date.now() - startTime) / 1000;
      learningOperationDuration.observe({ operation: operationName }, duration);

      // Check if it's a timeout error
      const isTimeout = error instanceof Error && 
        (error.message.includes('timeout') || error.message.includes('Timeout'));
      
      if (isTimeout) {
        learningTimeouts.inc({ operation: operationName });
        learningOperationsTotal.inc({ operation: operationName, status: 'timeout' });
      } else {
        learningOperationsTotal.inc({ operation: operationName, status: 'failure' });
      }

      throw error;
    }
  }

  constructor(
    queryExpansion?: QueryExpansionService,
    patternLearningService?: NavigationPatternLearningService
  ) {
    this.enabled = process.env.LEARNING_ENABLED !== 'false'; // Default: true
    this.clickBoost = parseFloat(process.env.LEARNING_CLICK_BOOST || '1.1');
    this.acceptBoost = parseFloat(process.env.LEARNING_ACCEPT_BOOST || '1.2');
    this.minFeedbackCount = parseInt(process.env.LEARNING_MIN_FEEDBACK_COUNT || '10', 10);
    this.minQualityScore = parseFloat(process.env.LEARNING_MIN_QUALITY_SCORE || '0.7');
    
    this.feedbackAnalysis = new FeedbackAnalysisService();
    this.queryExpansion = queryExpansion;
    this.dictionaryUpdateService = new DictionaryUpdateService();
    this.patternLearningService = patternLearningService;

    if (this.enabled) {
      console.log('[LearningService] Learning service enabled');
    } else {
      console.log('[LearningService] Learning service disabled');
    }
  }

  /**
   * Calculate ranking boosts based on feedback
   * 
   * @param abortSignal - Optional AbortSignal for cancellation support
   */
  async calculateRankingBoosts(abortSignal?: AbortSignal): Promise<RankingBoost[]> {
    if (!this.enabled) {
      return [];
    }

    return this.trackOperation('calculateRankingBoosts', async () => {
      try {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }
        
        const metrics = await this.feedbackAnalysis.analyzeDocumentQuality(this.minFeedbackCount);
        
        const boosts: RankingBoost[] = [];
        
        for (const docMetric of metrics) {
          if (abortSignal?.aborted) {
            throw new Error('Operation cancelled');
          }
          // Only boost documents with sufficient feedback and quality
          if (docMetric.qualityScore >= this.minQualityScore) {
            // Calculate boost based on acceptance rate and rating
            let boostMultiplier = 1.0;
            
            // Boost from acceptance rate
            const acceptanceRate = (docMetric.accepts + docMetric.rejects) > 0
              ? docMetric.accepts / (docMetric.accepts + docMetric.rejects)
              : 0;
            
            if (acceptanceRate > 0.7) {
              boostMultiplier *= this.acceptBoost;
            } else if (acceptanceRate > 0.5) {
              boostMultiplier *= this.clickBoost;
            }
            
            // Boost from rating
            if (docMetric.rating >= 4) {
              boostMultiplier *= 1.1;
            } else if (docMetric.rating >= 3) {
              boostMultiplier *= 1.05;
            }
            
            if (boostMultiplier > 1.0) {
              boosts.push({
                documentId: docMetric.documentId,
                boostMultiplier,
                reason: `Quality score: ${docMetric.qualityScore.toFixed(2)}, Accept rate: ${(acceptanceRate * 100).toFixed(1)}%`
              });
            }
          }
        }
        
        console.log(`[LearningService] Calculated ${boosts.length} ranking boosts`);
        return boosts;
      } catch (error) {
        console.error('[LearningService] Error calculating ranking boosts:', error);
        return [];
      }
    });
  }

  /**
   * Get ranking boost for a specific document
   */
  async getDocumentBoost(documentId: string): Promise<number> {
    if (!this.enabled) {
      return 1.0;
    }

    try {
      const boosts = await this.calculateRankingBoosts();
      const boost = boosts.find(b => b.documentId === documentId);
      return boost?.boostMultiplier || 1.0;
    } catch (error) {
      console.error('[LearningService] Error getting document boost:', error);
      return 1.0;
    }
  }

  /**
   * Discover new terms from high-quality documents
   * 
   * Extracts important terms from high-quality documents and identifies
   * synonym candidates based on document context and feedback patterns.
   * 
   * @param minFrequency - Minimum frequency for term discovery
   * @param abortSignal - Optional AbortSignal for cancellation support
   */
  async discoverNewTerms(minFrequency: number = 3, abortSignal?: AbortSignal): Promise<DictionaryUpdate[]> {
    if (!this.enabled || !this.queryExpansion) {
      return [];
    }

    try {
      // Get high-quality documents (quality score >= minQualityScore)
      const documentMetrics = await this.feedbackAnalysis.analyzeDocumentQuality(this.minFeedbackCount);
      const highQualityDocs = documentMetrics.filter(
        dm => dm.qualityScore >= this.minQualityScore
      );

      if (highQualityDocs.length === 0) {
        console.log('[LearningService] No high-quality documents found for term discovery');
        return [];
      }

      // Get document details from database (with timeout and batch limit)
      const db = await this.getDB();
      const docIds = highQualityDocs.map(dm => dm.documentId);
      // Limit total documents to prevent memory exhaustion
      const maxDocBatch = parseInt(process.env.LEARNING_MAX_DOCUMENT_BATCH || '500', 10);
      const limitedDocIds = docIds.slice(0, maxDocBatch);
      
      if (docIds.length > maxDocBatch) {
        console.log(
          `[LearningService] Limiting document batch from ${docIds.length} to ${maxDocBatch} for memory safety`
        );
      }

      // Process documents in smaller batches to reduce peak memory usage
      // This allows garbage collection between batches and prevents memory spikes
      const processingBatchSize = parseInt(process.env.LEARNING_PROCESSING_BATCH_SIZE || '50', 10);
      
      // Extract terms from document titles, summaries, and content
      const termFrequency = new Map<string, {
        frequency: number;
        contexts: Set<string>;
        documentIds: Set<string>;
      }>();

      const stopWords = new Set([
        'de', 'het', 'een', 'van', 'voor', 'met', 'op', 'in', 'aan', 'bij',
        'over', 'onder', 'is', 'zijn', 'was', 'waren', 'en', 'of', 'als',
        'dat', 'die', 'dit', 'deze', 'zijn', 'wordt', 'worden', 'kan', 'kunnen',
        'moet', 'moeten', 'zou', 'zouden', 'te', 'naar', 'door', 'uit'
      ]);

      // Process documents in batches to reduce memory usage
      for (let batchStart = 0; batchStart < limitedDocIds.length; batchStart += processingBatchSize) {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }
        
        const batchEnd = Math.min(batchStart + processingBatchSize, limitedDocIds.length);
        const batchDocIds = limitedDocIds.slice(batchStart, batchEnd);
        
        console.log(
          `[LearningService] Processing document batch ${batchStart + 1}-${batchEnd} of ${limitedDocIds.length}`
        );

        // Fetch batch of documents using canonical document service
        const { getCanonicalDocumentService } = await import('../canonical/CanonicalDocumentService.js');
        const { transformCanonicalArrayToLegacy } = await import('../../utils/canonicalToLegacyTransformer.js');
        const documentService = getCanonicalDocumentService();
        
        // Fetch documents by ID
        const documentsPromises = batchDocIds.map(id => documentService.findById(id));
        const canonicalDocs = await withTimeout(
          Promise.all(documentsPromises),
          DEFAULT_TIMEOUTS.DB_QUERY,
          `discoverNewTerms: canonical_documents query batch ${batchStart + 1}-${batchEnd}`
        );
        
        // Transform to legacy format and filter out nulls
        const documents = transformCanonicalArrayToLegacy(
          canonicalDocs.filter((doc): doc is NonNullable<typeof doc> => doc !== null)
        );

        // Process documents in this batch
        for (const doc of documents) {
          if (!doc._id) continue;
          const docId = doc._id.toString();
          const text = [
            doc.titel || '',
            doc.samenvatting || '',
            ((doc as { content?: string }).content || '').substring(0, 1000) // Limit content to first 1000 chars
          ].join(' ').toLowerCase();

          // Extract meaningful terms (2+ characters, not stop words)
          const words = text
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length >= 2 && !stopWords.has(word));

          // Count term frequency and collect contexts
          for (let i = 0; i < words.length; i++) {
            const term = words[i];
            if (term.length < 2) continue;

            if (!termFrequency.has(term)) {
              termFrequency.set(term, {
                frequency: 0,
                contexts: new Set(),
                documentIds: new Set()
              });
            }

            const stats = termFrequency.get(term)!;
            stats.frequency++;
            stats.documentIds.add(docId);

            // Collect context (surrounding words)
            // Limit context storage to prevent memory issues (max 50 contexts per term)
            if (stats.contexts.size < 50) {
              const context = words.slice(Math.max(0, i - 2), Math.min(words.length, i + 3))
                .filter(w => w !== term)
                .join(' ');
              if (context) {
                stats.contexts.add(context);
              }
            }
          }
        }

        // Allow garbage collection between batches by explicitly clearing the batch array
        // (documents array will be garbage collected after this iteration)
      }

      // Get term importance metrics from feedback (with timeout)
      const termMetrics = await withTimeout(
        this.feedbackAnalysis.analyzeTermImportance(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'discoverNewTerms: analyzeTermImportance'
      );
      const importanceMap = new Map(
        termMetrics.map(tm => [tm.term.toLowerCase(), tm])
      );

      // Identify synonym candidates
      const dictionaryUpdates: DictionaryUpdate[] = [];
      const processedTerms = new Set<string>();

      for (const [term, stats] of termFrequency.entries()) {
        // Skip if already processed or doesn't meet minimum frequency
        if (processedTerms.has(term) || stats.frequency < minFrequency) {
          continue;
        }

        const importance = importanceMap.get(term);
        const importanceScore = importance?.importanceScore || 0;

        // Only consider terms with sufficient importance or frequency
        if (importanceScore < 0.5 && stats.frequency < minFrequency * 2) {
          continue;
        }

        // Calculate confidence score
        const confidence = Math.min(1.0,
          0.4 * Math.min(1, stats.frequency / 10) + // Frequency component
          0.3 * importanceScore + // Importance from feedback
          0.2 * Math.min(1, stats.documentIds.size / 5) + // Document diversity
          0.1 * Math.min(1, stats.contexts.size / 10) // Context diversity
        );

        // Find potential synonyms from contexts
        const synonyms: string[] = [];
        const contextTerms = new Set<string>();

        // Collect terms that appear in similar contexts
        for (const context of stats.contexts) {
          const contextWords = context.split(/\s+/).filter(w => w.length >= 2);
          contextWords.forEach(w => {
            if (w !== term && !stopWords.has(w)) {
              contextTerms.add(w);
            }
          });
        }

        // Check if context terms appear frequently with this term
        for (const candidate of contextTerms) {
          const candidateStats = termFrequency.get(candidate);
          if (candidateStats && candidateStats.frequency >= minFrequency) {
            // Check if they appear in similar documents
            const overlap = Array.from(stats.documentIds).filter(
              id => candidateStats.documentIds.has(id)
            ).length;
            const similarity = overlap / Math.max(stats.documentIds.size, candidateStats.documentIds.size);

            // If terms appear together frequently, they might be synonyms
            if (similarity > 0.3 && candidateStats.frequency >= minFrequency) {
              synonyms.push(candidate);
            }
          }
        }

        // Only create update if we have synonyms or high confidence
        if (synonyms.length > 0 || confidence >= 0.7) {
          // Detect dictionary based on term
          const dictionary = this.detectDictionary(term);
          
          dictionaryUpdates.push({
            term,
            synonyms: synonyms.slice(0, 5), // Limit to top 5 synonyms
            dictionary,
            confidence,
            source: 'discovery'
          });

          processedTerms.add(term);
        }
      }

      console.log(`[LearningService] Discovered ${dictionaryUpdates.length} new terms with synonyms`);
      return dictionaryUpdates;
    } catch (error) {
      console.error('[LearningService] Error discovering new terms:', error);
      return [];
    }
  }

  /**
   * Detect which dictionary a term belongs to
   */
  private detectDictionary(term: string): DictionaryUpdate['dictionary'] {
    const termLower = term.toLowerCase();
    
    // Planning keywords
    const planningKeywords = ['planning', 'bestemmingsplan', 'ruimtelijk', 'stedenbouw', 'omgevingswet', 'bodem'];
    if (planningKeywords.some(kw => termLower.includes(kw))) {
      return 'planning';
    }
    
    // Housing keywords
    const housingKeywords = ['huisvesting', 'woning', 'woonruimte', 'accommodatie', 'arbeidsmigranten'];
    if (housingKeywords.some(kw => termLower.includes(kw))) {
      return 'housing';
    }
    
    // Policy keywords
    const policyKeywords = ['beleid', 'regelgeving', 'nota', 'richtlijn', 'verordening'];
    if (policyKeywords.some(kw => termLower.includes(kw))) {
      return 'policy';
    }
    
    // Default to Dutch
    return 'dutch';
  }

  /**
   * Update source quality scores
   * 
   * @param abortSignal - Optional AbortSignal for cancellation support
   */
  async updateSourceQuality(abortSignal?: AbortSignal): Promise<SourceUpdate[]> {
    if (!this.enabled) {
      return [];
    }

    return this.trackOperation('updateSourceQuality', async () => {
      try {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }
        
        const sourceMetrics = await withTimeout(
          this.feedbackAnalysis.analyzeSourceQuality(3),
          DEFAULT_TIMEOUTS.DB_QUERY,
          'updateSourceQuality: analyzeSourceQuality'
        );
        
        const updates: SourceUpdate[] = [];
        
        for (const sourceMetric of sourceMetrics) {
          // Mark sources with low quality as deprecated
          const deprecated = sourceMetric.qualityScore < 0.3;
          
          updates.push({
            sourceUrl: sourceMetric.sourceUrl,
            qualityScore: sourceMetric.qualityScore,
            deprecated
          });

          // Update source quality in bronwebsites collection (with timeout)
          const db = await this.getDB();
          await withTimeout(
            db.collection('bronwebsites').updateMany(
              { url: sourceMetric.sourceUrl },
              {
                $set: {
                  qualityScore: sourceMetric.qualityScore,
                  deprecated: deprecated,
                  qualityUpdatedAt: new Date()
                }
              }
            ),
            DEFAULT_TIMEOUTS.DB_QUERY,
            `updateSourceQuality: updateMany for ${sourceMetric.sourceUrl}`
          );
        }
        
        console.log(`[LearningService] Updated quality for ${updates.length} sources`);
        return updates;
      } catch (error) {
        console.error('[LearningService] Error updating source quality:', error);
        return [];
      }
    });
  }

  /**
   * Run a complete learning cycle
   * 
   * Automatically updates dictionaries and deprecates low-quality sources.
   * Includes pattern effectiveness tracking for cross-system learning.
   * 
   * @param operationId - Optional operation ID for cancellation tracking
   * @param abortSignal - Optional AbortSignal for cancellation support
   */
  async runLearningCycle(
    operationId?: string,
    abortSignal?: AbortSignal
  ): Promise<{
    rankingBoosts: RankingBoost[];
    dictionaryUpdates: DictionaryUpdate[];
    sourceUpdates: SourceUpdate[];
    metrics: QualityMetrics;
    patternEffectiveness?: {
      highPerformingPatterns: PatternEffectivenessMetrics[];
      lowPerformingPatterns: PatternEffectivenessMetrics[];
      averageSuccessRate: number;
      totalPatterns: number;
    };
    dictionaryUpdateResults?: {
      termsAdded: number;
      synonymsAdded: number;
    };
    sourceDeprecationCount?: number;
  }> {
    if (!this.enabled) {
      return {
        rankingBoosts: [],
        dictionaryUpdates: [],
        sourceUpdates: [],
        metrics: {
          documentQuality: [],
          sourceQuality: [],
          termImportance: [],
          overallCTR: 0,
          overallAcceptanceRate: 0
        }
      };
    }

    // Prevent concurrent execution
    if (this.learningCycleRunning) {
      console.warn('[LearningService] Learning cycle already running, skipping this execution');
      throw new Error('Learning cycle is already running. Please wait for the current cycle to complete.');
    }

    this.learningCycleRunning = true;
    console.log('[LearningService] Starting learning cycle...');
    
    // Generate operation ID if not provided
    const opId = operationId || `learning-cycle-${Date.now()}`;
    this.currentCycleOperationId = opId;
    this.currentCycleStartTime = new Date();
    
    // Create abort controller for cancellation support
    const abortController = new AbortController();
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        abortController.abort();
      });
    }
    
    // Track this operation
    this.activeOperations.set(opId, {
      abortController,
      startTime: new Date(),
      operationType: 'learning-cycle'
    });
    
    // Helper function to check for cancellation
    const checkCancellation = () => {
      if (abortController.signal.aborted || abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
    };
    
    try {
      // Wrap each operation with individual timeout to prevent one hanging operation from blocking others
      // Use Promise.allSettled so that if one operation fails/times out, others can still complete
      // Check for cancellation before starting operations
      checkCancellation();
      
      // Execute operations in parallel with progress tracking
      this.currentCycleStep = 'Initializing operations...';
      
      const operationResults = await withTimeout(
        Promise.allSettled([
          (async () => {
            this.currentCycleStep = 'Calculating ranking boosts...';
            return withTimeout(
              this.calculateRankingBoosts(abortController.signal),
              DEFAULT_TIMEOUTS.LEARNING_OPERATION,
              'calculateRankingBoosts'
            );
          })(),
          (async () => {
            this.currentCycleStep = 'Discovering new terms...';
            return withTimeout(
              this.discoverNewTerms(undefined, abortController.signal),
              DEFAULT_TIMEOUTS.LEARNING_OPERATION,
              'discoverNewTerms'
            );
          })(),
          (async () => {
            this.currentCycleStep = 'Updating source quality...';
            return withTimeout(
              this.updateSourceQuality(abortController.signal),
              DEFAULT_TIMEOUTS.LEARNING_OPERATION,
              'updateSourceQuality'
            );
          })(),
          (async () => {
            this.currentCycleStep = 'Analyzing quality metrics...';
            return withTimeout(
              this.feedbackAnalysis.getQualityMetrics(this.minFeedbackCount, 3),
              DEFAULT_TIMEOUTS.LEARNING_OPERATION,
              'getQualityMetrics'
            );
          })(),
          (async () => {
            this.currentCycleStep = 'Analyzing pattern effectiveness...';
            return withTimeout(
              this.analyzePatternEffectiveness(),
              DEFAULT_TIMEOUTS.LEARNING_OPERATION,
              'analyzePatternEffectiveness'
            );
          })()
        ]),
        DEFAULT_TIMEOUTS.LEARNING_CYCLE,
        'runLearningCycle: parallel operations'
      );
      
      checkCancellation();
      
      this.currentCycleStep = 'Processing results...';

    // Extract results from Promise.allSettled, handling both fulfilled and rejected promises
    // Helper to extract result or log error and return default
    const extractResult = <T>(
      result: PromiseSettledResult<T>,
      operationName: string,
      defaultValue: T
    ): T => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      console.error(`[LearningService] ${operationName} failed:`, result.reason);
      return defaultValue;
    };

    const rankingBoosts = extractResult(
      operationResults[0],
      'calculateRankingBoosts',
      [] as RankingBoost[]
    );
    
    const dictionaryUpdates = extractResult(
      operationResults[1],
      'discoverNewTerms',
      [] as DictionaryUpdate[]
    );
    
    const sourceUpdates = extractResult(
      operationResults[2],
      'updateSourceQuality',
      [] as SourceUpdate[]
    );
    
    const metrics = extractResult(
      operationResults[3],
      'getQualityMetrics',
      {
        documentQuality: [],
        sourceQuality: [],
        termImportance: [],
        overallCTR: 0,
        overallAcceptanceRate: 0
      } as QualityMetrics
    );
    
    const patternEffectiveness = extractResult(
      operationResults[4],
      'analyzePatternEffectiveness',
      {
        highPerformingPatterns: [],
        lowPerformingPatterns: [],
        averageSuccessRate: 0,
        totalPatterns: 0
      }
    );

      // Automatically update dictionaries with discovered terms
      let dictionaryUpdateResults: { termsAdded: number; synonymsAdded: number } | undefined;
      if (dictionaryUpdates.length > 0) {
        try {
          this.currentCycleStep = 'Updating dictionaries...';
          // Group updates by dictionary
          const updatesByDict = new Map<string, typeof dictionaryUpdates>();
          for (const update of dictionaryUpdates) {
            const key = update.dictionary;
            if (!updatesByDict.has(key)) {
              updatesByDict.set(key, []);
            }
            updatesByDict.get(key)!.push(update);
          }

        // Update each dictionary (with timeout)
        let totalTermsAdded = 0;
        let totalSynonymsAdded = 0;
        for (const [dictName, updates] of updatesByDict.entries()) {
          checkCancellation();
          this.currentCycleStep = `Updating ${dictName} dictionary...`;
          const result = await withTimeout(
            this.dictionaryUpdateService.updateDictionary(updates, dictName, 0.6),
            DEFAULT_TIMEOUTS.DICTIONARY_UPDATE,
            `runLearningCycle: updateDictionary for ${dictName}`
          );
          totalTermsAdded += result.termsAdded;
          totalSynonymsAdded += result.synonymsAdded;
        }

        // Reload QueryExpansionService dictionaries if available (with timeout)
        if (this.queryExpansion) {
          checkCancellation();
          this.currentCycleStep = 'Reloading dictionaries...';
          await withTimeout(
            this.queryExpansion.reloadDictionaries(),
            DEFAULT_TIMEOUTS.DICTIONARY_UPDATE,
            'runLearningCycle: reloadDictionaries'
          );
        }

          dictionaryUpdateResults = {
            termsAdded: totalTermsAdded,
            synonymsAdded: totalSynonymsAdded
          };
          console.log(`[LearningService] Dictionary updated: ${totalTermsAdded} terms, ${totalSynonymsAdded} synonyms`);
        } catch (error) {
          console.error('[LearningService] Error updating dictionary:', error);
        }
      }

      // Count deprecated sources
      const sourceDeprecationCount = sourceUpdates.filter(su => su.deprecated).length;
      if (sourceDeprecationCount > 0) {
        console.log(`[LearningService] ${sourceDeprecationCount} sources marked as deprecated`);
      }

      // Log pattern effectiveness insights
      if (patternEffectiveness.totalPatterns > 0) {
        console.log(
          `[LearningService] Pattern effectiveness: ${patternEffectiveness.highPerformingPatterns.length} high-performing, ` +
          `${patternEffectiveness.lowPerformingPatterns.length} low-performing patterns ` +
          `(avg success rate: ${(patternEffectiveness.averageSuccessRate * 100).toFixed(1)}%)`
        );
      }

      // Record cycle results in metrics
      learningCycleResults.set({ metric: 'ranking_boosts' }, rankingBoosts.length);
      learningCycleResults.set({ metric: 'dictionary_updates' }, dictionaryUpdates.length);
      learningCycleResults.set({ metric: 'source_updates' }, sourceUpdates.length);
      if (dictionaryUpdateResults) {
        learningCycleResults.set({ metric: 'terms_added' }, dictionaryUpdateResults.termsAdded);
        learningCycleResults.set({ metric: 'synonyms_added' }, dictionaryUpdateResults.synonymsAdded);
      }
      learningCycleResults.set({ metric: 'sources_deprecated' }, sourceDeprecationCount);

      this.currentCycleStep = 'Finalizing...';
      console.log(`[LearningService] Learning cycle completed (operationId: ${opId})`);
      
      const result = {
        rankingBoosts,
        dictionaryUpdates,
        sourceUpdates,
        metrics,
        patternEffectiveness,
        dictionaryUpdateResults,
        sourceDeprecationCount
      };

      const completedAt = new Date();
      const duration = completedAt.getTime() - this.currentCycleStartTime!.getTime();
      this.currentCycleStep = null;

      // Store last cycle result
      this.lastCycleResult = {
        operationId: opId,
        status: 'completed',
        completedAt,
        result,
      };

      // Store cycle execution in database for history
      await this.storeCycleExecution({
        operationId: opId,
        status: 'completed',
        startTime: this.currentCycleStartTime!,
        endTime: completedAt,
        duration,
        result: {
          rankingBoostsCount: rankingBoosts.length,
          dictionaryUpdatesCount: dictionaryUpdates.length,
          sourceUpdatesCount: sourceUpdates.length,
          sourcesDeprecated: sourceDeprecationCount || 0,
          termsAdded: dictionaryUpdateResults?.termsAdded || 0,
          synonymsAdded: dictionaryUpdateResults?.synonymsAdded || 0,
          overallCTR: metrics.overallCTR,
          overallAcceptanceRate: metrics.overallAcceptanceRate,
        },
        error: undefined,
      });
      
      return result;
    } catch (error) {
      const failedAt = new Date();
      const duration = this.currentCycleStartTime 
        ? failedAt.getTime() - this.currentCycleStartTime.getTime()
        : 0;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'Operation cancelled')) {
        console.log(`[LearningService] Learning cycle cancelled (operationId: ${opId})`);
        this.lastCycleResult = {
          operationId: opId,
          status: 'failed',
          completedAt: failedAt,
          error: 'Cycle was cancelled by user',
        };
        
        // Store cancelled cycle in database
        await this.storeCycleExecution({
          operationId: opId,
          status: 'failed',
          startTime: this.currentCycleStartTime || failedAt,
          endTime: failedAt,
          duration,
          result: undefined,
          error: 'Cycle was cancelled by user',
        });
        
        throw error;
      }
      console.error('[LearningService] Error in learning cycle:', error);
      
      // Store error in last cycle result
      this.lastCycleResult = {
        operationId: opId,
        status: 'failed',
        completedAt: failedAt,
        error: errorMessage,
      };

      // Store failed cycle in database
      await this.storeCycleExecution({
        operationId: opId,
        status: 'failed',
        startTime: this.currentCycleStartTime || failedAt,
        endTime: failedAt,
        duration,
        result: undefined,
        error: errorMessage,
      });
      
      throw error;
    } finally {
      // Remove from active operations
      this.activeOperations.delete(opId);
      // Reset learning cycle running flag
      this.learningCycleRunning = false;
      this.currentCycleOperationId = null;
      this.currentCycleStartTime = null;
      this.currentCycleStep = null;
    }
  }

  /**
   * Learn from pattern application result.
   * 
   * Integrates pattern learning with the learning cycle by tracking
   * pattern effectiveness and learning from application results.
   * 
   * @param result - Pattern application result
   * @param context - Navigation context where pattern was applied
   * @param success - Whether the pattern application was successful
   */
  async learnFromPatternApplication(
    result: PatternApplicationResult,
    context: NavigationContext,
    success: boolean
  ): Promise<void> {
    if (!this.enabled || !this.patternLearningService) {
      return;
    }

    try {
      // If pattern was applied, track the result (with timeout)
      if (result.applied && result.pattern) {
        await withTimeout(
          this.patternLearningService.trackApplicationResult(
            result.pattern.id,
            success,
            context,
            result.matchScore
          ),
          DEFAULT_TIMEOUTS.DB_QUERY,
          `learnFromPatternApplication: trackApplicationResult for ${result.pattern.id}`
        );
        console.log(
          `[LearningService] Pattern application tracked: ${result.pattern.id} (success: ${success})`
        );
      }
    } catch (error) {
      console.error('[LearningService] Error learning from pattern application:', error);
      // Don't throw - pattern learning failures shouldn't break the main flow
    }
  }

  /**
   * Get pattern effectiveness metrics.
   * 
   * Retrieves effectiveness data for all active patterns to inform
   * learning decisions and pattern quality assessment.
   * 
   * @returns Array of pattern effectiveness metrics
   */
  async getPatternEffectivenessMetrics(): Promise<PatternEffectivenessMetrics[]> {
    if (!this.enabled || !this.patternLearningService) {
      return [];
    }

    try {
      // Access pattern repository through pattern learning service
      // We need to get patterns from the database directly since we don't have direct access to repository
      const db = await this.getDB();
      // Limit patterns to prevent memory exhaustion (default: 1000 patterns)
      const maxPatterns = parseInt(process.env.LEARNING_MAX_PATTERNS || '1000', 10);
      const patterns = await withTimeout(
        db
          .collection<LearnedPatternDocument>('learned_navigation_patterns')
          .find({ status: { $in: ['active', 'experimental'] } })
          .limit(maxPatterns)
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'getPatternEffectivenessMetrics: learned_navigation_patterns query'
      );
      
      if (patterns.length >= maxPatterns) {
        console.warn(
          `[LearningService] Pattern query result may be truncated. Found at least ${maxPatterns} patterns.`
        );
      }

      const metrics: PatternEffectivenessMetrics[] = patterns.map((pattern) => {
        const effectiveness = pattern.effectiveness || {};
        const totalApplications = (effectiveness.successCount || 0) + (effectiveness.failureCount || 0);
        const successRate = totalApplications > 0
          ? (effectiveness.successCount || 0) / totalApplications
          : 0;

        return {
          patternId: pattern._id.toString(),
          successRate,
          totalApplications,
          averageMatchScore: effectiveness.averageMatchScore,
          confidence: effectiveness.confidence || 0,
          lastUsed: effectiveness.lastUsed,
          status: pattern.status,
        };
      });

      console.log(`[LearningService] Retrieved effectiveness metrics for ${metrics.length} patterns`);
      return metrics;
    } catch (error) {
      console.error('[LearningService] Error getting pattern effectiveness metrics:', error);
      return [];
    }
  }

  /**
   * Track pattern effectiveness data for historical analysis.
   * 
   * Logs pattern application data. Pattern effectiveness is persisted in the database
   * through the NavigationPatternLearningService, so no in-memory history is maintained
   * to prevent memory leaks.
   * 
   * @param patternData - Pattern application data
   */
  async trackPatternEffectiveness(patternData: PatternEffectivenessData): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      // Log pattern learning (data is persisted in database via NavigationPatternLearningService)
      console.log(
        `[LearningService] Pattern application tracked: ${patternData.patternId} ` +
        `(success: ${patternData.success}, domain: ${patternData.domain})`
      );
    } catch (error) {
      console.error('[LearningService] Error tracking pattern effectiveness:', error);
      // Don't throw - pattern learning failures shouldn't break the main flow
    }
  }

  /**
   * Analyze pattern effectiveness trends.
   * 
   * Identifies patterns that are performing well or poorly to inform
   * learning decisions and pattern optimization.
   * 
   * @returns Analysis of pattern effectiveness
   */
  async analyzePatternEffectiveness(): Promise<{
    highPerformingPatterns: PatternEffectivenessMetrics[];
    lowPerformingPatterns: PatternEffectivenessMetrics[];
    averageSuccessRate: number;
    totalPatterns: number;
  }> {
    if (!this.enabled || !this.patternLearningService) {
      return {
        highPerformingPatterns: [],
        lowPerformingPatterns: [],
        averageSuccessRate: 0,
        totalPatterns: 0,
      };
    }

    return this.trackOperation('analyzePatternEffectiveness', async () => {
      try {
        const metrics = await withTimeout(
          this.getPatternEffectivenessMetrics(),
          DEFAULT_TIMEOUTS.PATTERN_ANALYSIS,
          'analyzePatternEffectiveness: getPatternEffectivenessMetrics'
        );

        if (metrics.length === 0) {
          return {
            highPerformingPatterns: [],
            lowPerformingPatterns: [],
            averageSuccessRate: 0,
            totalPatterns: 0,
          };
        }

        // Calculate average success rate
        const totalSuccessRate = metrics.reduce((sum, m) => sum + m.successRate, 0);
        const averageSuccessRate = totalSuccessRate / metrics.length;

        // Identify high and low performing patterns
        const highPerformingPatterns = metrics.filter(
          m => m.successRate >= 0.7 && m.totalApplications >= 5
        );
        const lowPerformingPatterns = metrics.filter(
          m => m.successRate < 0.3 && m.totalApplications >= 3
        );

        console.log(
          `[LearningService] Pattern effectiveness analysis: ${highPerformingPatterns.length} high-performing, ${lowPerformingPatterns.length} low-performing patterns`
        );

        return {
          highPerformingPatterns,
          lowPerformingPatterns,
          averageSuccessRate,
          totalPatterns: metrics.length,
        };
      } catch (error) {
        console.error('[LearningService] Error analyzing pattern effectiveness:', error);
        return {
          highPerformingPatterns: [],
          lowPerformingPatterns: [],
          averageSuccessRate: 0,
          totalPatterns: 0,
        };
      }
    });
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current learning cycle status
   */
  getCycleStatus(): {
      status: 'idle' | 'running' | 'completed' | 'failed';
      currentCycle?: {
        operationId: string;
        startTime: Date;
        step?: string;
      };
      lastCycle?: {
        operationId: string;
        status: 'completed' | 'failed';
        completedAt: Date;
        error?: string;
      };
    } {
    if (this.learningCycleRunning && this.currentCycleOperationId && this.currentCycleStartTime) {
      return {
        status: 'running',
        currentCycle: {
          operationId: this.currentCycleOperationId,
          startTime: this.currentCycleStartTime,
          step: this.currentCycleStep || undefined,
        },
        lastCycle: this.lastCycleResult ? {
          operationId: this.lastCycleResult.operationId,
          status: this.lastCycleResult.status,
          completedAt: this.lastCycleResult.completedAt,
          error: this.lastCycleResult.error,
        } : undefined,
      };
    }

    return {
      status: this.lastCycleResult ? (this.lastCycleResult.status === 'completed' ? 'completed' : 'failed') : 'idle',
      lastCycle: this.lastCycleResult ? {
        operationId: this.lastCycleResult.operationId,
        status: this.lastCycleResult.status,
        completedAt: this.lastCycleResult.completedAt,
        error: this.lastCycleResult.error,
      } : undefined,
    };
  }

  /**
   * Cancel a running learning cycle
   * 
   * @param operationId - Operation ID of the cycle to cancel (optional, cancels current if not provided)
   * @returns true if cycle was cancelled, false if not found or not running
   */
  cancelCycle(operationId?: string): boolean {
    // If no operation ID provided, cancel current cycle
    const opId = operationId || this.currentCycleOperationId;
    
    if (!opId) {
      return false;
    }

    const operation = this.activeOperations.get(opId);
    if (!operation || operation.operationType !== 'learning-cycle') {
      return false;
    }

    // Abort the operation
    operation.abortController.abort();
    
    // Remove from active operations
    this.activeOperations.delete(opId);
    
    // Reset running state if this is the current cycle
    if (opId === this.currentCycleOperationId) {
      this.learningCycleRunning = false;
      this.currentCycleOperationId = null;
      this.currentCycleStartTime = null;
    }
    
    console.log(`[LearningService] Learning cycle cancelled (operationId: ${opId})`);
    return true;
  }

  /**
   * Recover stuck learning cycles
   * Checks for cycles that have been running for more than the specified timeout
   * 
   * @param timeoutMinutes - Maximum time a cycle should run (default: 10 minutes)
   * @returns Number of cycles recovered
   */
  recoverStuckCycles(timeoutMinutes: number = 10): number {
    if (!this.learningCycleRunning) {
      return 0;
    }

    // Check if current cycle has been running too long
    if (this.currentCycleStartTime) {
      const now = new Date();
      const elapsedMinutes = (now.getTime() - this.currentCycleStartTime.getTime()) / (1000 * 60);
      
      if (elapsedMinutes > timeoutMinutes) {
        console.warn(
          `[LearningService] Recovering stuck learning cycle (running for ${elapsedMinutes.toFixed(1)} minutes)`
        );
        
        // Reset running state
        this.learningCycleRunning = false;
        this.currentCycleOperationId = null;
        this.currentCycleStartTime = null;
        
        // Cancel any active operations
        for (const [opId, operation] of this.activeOperations.entries()) {
          if (operation.operationType === 'learning-cycle') {
            operation.abortController.abort();
            this.activeOperations.delete(opId);
          }
        }
        
        // Record as failed
        this.lastCycleResult = {
          operationId: `recovered-${Date.now()}`,
          status: 'failed',
          completedAt: new Date(),
          error: `Cycle was stuck and recovered after ${elapsedMinutes.toFixed(1)} minutes`,
        };
        
        return 1;
      }
    }

    return 0;
  }

  /**
   * Store cycle execution in database for history
   */
  private async storeCycleExecution(execution: {
    operationId: string;
    status: 'completed' | 'failed';
    startTime: Date;
    endTime: Date;
    duration: number;
    result?: {
      rankingBoostsCount: number;
      dictionaryUpdatesCount: number;
      sourceUpdatesCount: number;
      sourcesDeprecated: number;
      termsAdded: number;
      synonymsAdded: number;
      overallCTR: number;
      overallAcceptanceRate: number;
    };
    error?: string;
  }): Promise<void> {
    try {
      const db = await this.getDB();
      await withTimeout(
        db.collection('learning_cycle_executions').insertOne({
          operationId: execution.operationId,
          status: execution.status,
          startTime: execution.startTime,
          endTime: execution.endTime,
          duration: execution.duration,
          result: execution.result,
          error: execution.error,
          createdAt: new Date(),
        }),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'storeCycleExecution'
      );
    } catch (error) {
      // Don't throw - history storage failure shouldn't break learning cycle
      console.error('[LearningService] Error storing cycle execution:', error);
    }
  }

  /**
   * Get cycle execution history
   */
  async getCycleHistory(limit: number = 20, offset: number = 0): Promise<{
    cycles: Array<{
      operationId: string;
      status: 'completed' | 'failed';
      startTime: Date;
      endTime: Date;
      duration: number;
      result?: {
        rankingBoostsCount: number;
        dictionaryUpdatesCount: number;
        sourceUpdatesCount: number;
        sourcesDeprecated: number;
        termsAdded: number;
        synonymsAdded: number;
        overallCTR: number;
        overallAcceptanceRate: number;
      };
      error?: string;
    }>;
    total: number;
  }> {
    try {
      const db = await this.getDB();
      const collection = db.collection('learning_cycle_executions');
      
      const [cycles, total] = await Promise.all([
        withTimeout(
          collection
            .find({})
            .sort({ startTime: -1 })
            .skip(offset)
            .limit(limit)
            .toArray(),
          DEFAULT_TIMEOUTS.DB_QUERY,
          'getCycleHistory: find cycles'
        ),
        withTimeout(
          collection.countDocuments({}),
          DEFAULT_TIMEOUTS.DB_QUERY,
          'getCycleHistory: count total'
        ),
      ]);

      return {
        cycles: cycles.map((doc: any) => ({
          operationId: doc.operationId,
          status: doc.status,
          startTime: doc.startTime,
          endTime: doc.endTime,
          duration: doc.duration,
          result: doc.result,
          error: doc.error,
        })),
        total,
      };
    } catch (error) {
      console.error('[LearningService] Error getting cycle history:', error);
      return { cycles: [], total: 0 };
    }
  }
}

