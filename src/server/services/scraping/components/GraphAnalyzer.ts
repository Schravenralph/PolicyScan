import { logger } from '../../../utils/logger.js';
import { RunManager } from '../../workflow/RunManager.js';
import { GraphClusteringService, ClusterNode } from '../../graphs/navigation/GraphClusteringService.js';
import { LocalEmbeddingProvider } from '../../query/VectorService.js';
import { TIMEOUTS } from '../../../config/constants.js';
import { BadRequestError, ExternalServiceError } from '../../../types/errors.js';

export class GraphAnalyzer {
  private clusterEmbeddingCache: Map<string, number[]>;
  private embeddingReady: boolean = false;

  constructor(
    private graphClustering: GraphClusteringService,
    private queryEmbeddingProvider: LocalEmbeddingProvider,
    private runManager: RunManager
  ) {
    this.clusterEmbeddingCache = new Map();
  }

  /**
   * Analyzes navigation graph clusters using semantic similarity to find relevant clusters.
   * Creates meta-graph, computes embeddings, and ranks clusters by similarity to query.
   *
   * @param context - Workflow context with required 'onderwerp' and optional thema/documents
   * @param runId - Workflow run identifier
   * @returns Object with relevantClusters and frontier (array of URLs)
   */
  async analyzeGraph(context: Record<string, unknown>, runId: string): Promise<{ relevantClusters: ClusterNode[]; frontier: string[] }> {
    await this.runManager.log(runId, '[i18n:workflowLogs.analyzingGraphClusters]', 'info');

    // Create meta-graph to find relevant clusters
    const metaGraph = await this.graphClustering.createMetaGraph({ pathDepth: 2, minClusterSize: 3 });

    await this.runManager.log(runId, 'Computing semantic similarity scores...', 'debug');

    await this.ensureEmbeddingProvider();
    const queryText = [context.onderwerp as string, context.thema as string].filter(Boolean).join(' ').trim();
    const queryVector = await this.queryEmbeddingProvider.generateEmbedding(queryText || 'thema');

    const clusterScores = await Promise.all(
      Object.values(metaGraph.clusters).map(async (cluster: ClusterNode) => {
        const vec = await this.getClusterEmbedding(cluster);
        const score = this.cosineSimilarity(queryVector, vec);
        return { cluster, score };
      })
    );

    const similarityThreshold = 0.25;
    const ranked = clusterScores
      .sort((a, b) => b.score - a.score)
      .filter(entry => entry.score >= similarityThreshold);

    const relevantClusters: ClusterNode[] = ranked.map(entry => entry.cluster).slice(0, 5);

    if (relevantClusters.length > 0) {
      const summary = ranked.slice(0, 5).map(entry => `${entry.cluster.label} (${entry.score.toFixed(2)})`).join(', ');
      await this.runManager.log(runId, `[i18n:workflowLogs.semanticClusterMatch]|${summary}`, 'info');
    } else {
      await this.runManager.log(runId, '[i18n:workflowLogs.noSemanticClusterMatches]', 'warn');
      const onderwerpStr = typeof context.onderwerp === 'string' ? context.onderwerp : '';
      const keywordFallback = Object.values(metaGraph.clusters).filter((cluster: ClusterNode) => {
        return cluster.label.toLowerCase().includes(onderwerpStr.toLowerCase()) ||
          cluster.children.some((url: string) => url.includes(onderwerpStr.toLowerCase()));
      });
      relevantClusters.push(...keywordFallback.slice(0, 5));
    }

    // Add cluster nodes to the frontier for recursive crawling
    const frontier: string[] = [];
    for (const cluster of relevantClusters) {
      frontier.push(...cluster.children.slice(0, 5)); // Limit to top 5 per cluster to start
    }

    return { relevantClusters, frontier };
  }

  /**
   * Iteration 149: Enhanced embedding provider initialization with error handling
   */
  private async ensureEmbeddingProvider(): Promise<void> {
    if (this.embeddingReady) return;

    // Iteration 150: Initialization with timeout
    try {
      const initPromise = this.queryEmbeddingProvider.init();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Embedding provider initialization timeout')), TIMEOUTS.EMBEDDING_INITIALIZATION)
      );
      await Promise.race([initPromise, timeoutPromise]);
      this.embeddingReady = true;
    } catch (error) {
      // Iteration 151: Initialization error handling
      logger.warn({ error }, 'Embedding provider initialization failed');
      throw error;
    }
  }

  /**
   * Iteration 152: Enhanced cluster embedding with validation
   */
  private async getClusterEmbedding(cluster: ClusterNode): Promise<number[]> {
    // Iteration 153: Cache key generation with validation
    const cacheKey = cluster.id || cluster.urlPattern || '';
    if (!cacheKey) {
      throw new BadRequestError('Cluster must have id or urlPattern', {
        reason: 'missing_cluster_identifier',
        operation: 'generateClusterEmbedding',
        cluster: { id: cluster.id, urlPattern: cluster.urlPattern }
      });
    }

    // Iteration 154: Cache lookup with validation
    const cached = this.clusterEmbeddingCache.get(cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }

    // Iteration 155: Text generation with fallback
    const text = `${cluster.label || ''} ${cluster.urlPattern || ''}`.trim();
    if (!text) {
      throw new BadRequestError('Cluster must have label or urlPattern for embedding', {
        reason: 'missing_cluster_text',
        operation: 'generateClusterEmbedding',
        cluster: { label: cluster.label, urlPattern: cluster.urlPattern }
      });
    }

    // Iteration 156: Embedding generation with error handling
    try {
      await this.ensureEmbeddingProvider();
      const vector = await this.queryEmbeddingProvider.generateEmbedding(text);

      // Iteration 157: Vector validation
      if (!vector || vector.length === 0) {
        throw new ExternalServiceError('Embedding Service', 'Empty embedding vector returned', {
          reason: 'empty_embedding_vector',
          operation: 'generateClusterEmbedding',
          cluster: { id: cluster.id, urlPattern: cluster.urlPattern }
        });
      }

      // Iteration 158: Cache storage with validation
      this.clusterEmbeddingCache.set(cacheKey, vector);
      return vector;
    } catch (error) {
      // Iteration 159: Embedding generation error handling
      logger.warn({ error, cacheKey }, 'Failed to generate embedding for cluster');
      throw error;
    }
  }

  /**
   * Iteration 160: Enhanced cosine similarity with validation
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    // Iteration 161: Input validation
    if (!a || !b || a.length === 0 || b.length === 0) {
      return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);

    // Iteration 162: Enhanced calculation with NaN handling
    for (let i = 0; i < len; i++) {
      const aVal = a[i] || 0;
      const bVal = b[i] || 0;
      dot += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    // Iteration 163: Enhanced zero check
    if (normA === 0 || normB === 0 || isNaN(normA) || isNaN(normB)) {
      return 0;
    }

    // Iteration 164: Result validation
    const result = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return isNaN(result) || !isFinite(result) ? 0 : result;
  }
}
