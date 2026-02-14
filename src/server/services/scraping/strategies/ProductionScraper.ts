import axios from 'axios';
import * as path from 'path';
import { logger } from '../../../utils/logger.js';
import { NavigationGraph } from '../../graphs/navigation/NavigationGraph.js';
import { RunManager } from '../../workflow/RunManager.js';
import { KnowledgeBaseManager } from '../../knowledgeBase/KnowledgeBaseManager.js';
import { getSourceMetadata } from '../../source/sourceDetection.js';
import { BadRequestError } from '../../../types/errors.js';
import {
  ScanParameters,
  ScrapedDocument,
  SourceType
} from '../../infrastructure/types.js';
import { TIMEOUTS } from '../../../config/constants.js';
import type { NavigationNode } from '../../graphs/navigation/NavigationGraph.js';

export class ProductionScraper {
  constructor(
    private navigationGraph: NavigationGraph,
    private runManager: RunManager
  ) {}

  /**
   * Production Mode: Efficiently scrape using navigation graph (US-010)
   *
   * This method implements production mode behavior:
   * - Only processes nodes that already exist in the navigation graph (no exploration)
   * - Uses change detection to skip unchanged content (content hash comparison)
   * - Updates last_scraped timestamp even when content hasn't changed
   * - Updates lastVisited timestamp in navigation graph for tracking
   * - Completes quickly and efficiently by following known paths
   *
   * @param params - Scan parameters with mode='prod'
   * @param runId - Workflow run identifier for logging
   * @returns Array of scraped documents (only changed or new content)
   */
  async scrape(params: ScanParameters, runId: string): Promise<ScrapedDocument[]> {
    // Iteration 21: Start time tracking for performance monitoring
    const startTime = Date.now();
    const documents: ScrapedDocument[] = [];
    const allNodes = await this.navigationGraph.getAllNodes();

    // Iteration 22: Enhanced node filtering with relevance scoring
    const relevantNodes = allNodes.filter(node => {
      const nodeText = `${node.title || ''} ${node.url}`.toLowerCase();
      const queryText = `${params.onderwerp} ${params.thema}`.toLowerCase();
      return nodeText.includes(queryText) || queryText.split(' ').some(term => nodeText.includes(term));
    }).map(node => {
      // Iteration 23: Calculate relevance score for prioritization
      const nodeText = `${node.title || ''} ${node.url}`.toLowerCase();
      const queryText = `${params.onderwerp} ${params.thema}`.toLowerCase();
      const queryTerms = queryText.split(' ');
      const matchCount = queryTerms.filter(term => nodeText.includes(term)).length;
      return { node, relevanceScore: matchCount / queryTerms.length };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore).map(item => item.node);

    // Iteration 24: Enhanced logging with node statistics
    await this.runManager.log(
      runId,
      `Production mode: Found ${relevantNodes.length} relevant nodes from ${allNodes.length} total nodes (${((relevantNodes.length / allNodes.length) * 100).toFixed(1)}% relevance)`,
      'info'
    );

    // Iteration 25: Lazy initialization of KnowledgeBaseManager
    const kbBaseDir = path.join(process.cwd(), 'data/knowledge_base');
    const kbManager = new KnowledgeBaseManager(kbBaseDir);

    // Iteration 26: Extended metrics collection
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let totalProcessingTime = 0;
    const domainStats = new Map<string, { count: number; errors: number }>();

    // Iteration 27: Concurrency Pool Configuration
    // Increased from 10 to 20 for faster processing
    const CONCURRENCY_LIMIT = 20;
    const executing = new Set<Promise<void>>();
    let processedNodesCount = 0;
    const nodesToUpdate: any[] = [];

    // Iteration 28: Progress tracking with concurrency
    for (const node of relevantNodes) {
      // Use skipGraphUpdate: true to collect nodes for batch update
      const p = this.processSingleNode(node, runId, kbManager, domainStats, true).then(async (result) => {
        processedNodesCount++;

        // Update statistics
        if (result.status === 'error') errorCount++;
        else if (result.status === 'skipped') skippedCount++;
        else updatedCount++;

        if (result.updatedNode) {
          nodesToUpdate.push(result.updatedNode);
        }

        if (nodesToUpdate.length >= 50) {
          const batch = nodesToUpdate.splice(0, nodesToUpdate.length);
          try {
            await this.runManager.log(runId, `Batch updating ${batch.length} nodes in navigation graph...`, 'info');
            await this.navigationGraph.addNodesBatch(batch, 50);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            await this.runManager.log(runId, `⚠️ Failed to batch update navigation graph: ${errorMsg}`, 'warn');
          }
        }

        totalProcessingTime += result.processingTime;
        if (result.document) documents.push(result.document);

        // Progress logging (roughly every 10 nodes)
        if (processedNodesCount % 10 === 0) {
          const progressPercent = Math.round((processedNodesCount / relevantNodes.length) * 100);
          const avgTime = totalProcessingTime / (processedNodesCount || 1);
          // Fire and forget log to not block loop
          this.runManager.log(runId, `Progress: ${processedNodesCount}/${relevantNodes.length} (${progressPercent}%) - avg: ${avgTime.toFixed(0)}ms/node`, 'info').catch(() => {});
        }

        executing.delete(p);
      });

      executing.add(p);

      if (executing.size >= CONCURRENCY_LIMIT) {
        await Promise.race(executing);
      }
    }

    // Wait for remaining tasks
    await Promise.all(executing);

    // Batch update nodes in navigation graph
    if (nodesToUpdate.length > 0) {
      try {
        await this.runManager.log(runId, `Batch updating ${nodesToUpdate.length} nodes in navigation graph...`, 'info');
        // Create a copy of the array to avoid mutation issues if cleared subsequently
        const finalBatch = [...nodesToUpdate];
        await this.navigationGraph.addNodesBatch(finalBatch, 50); // Batch size of 50
        await this.runManager.log(runId, 'Batch update completed', 'info');
        nodesToUpdate.length = 0; // Clear array after successful update
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await this.runManager.log(runId, `⚠️ Failed to batch update navigation graph: ${errorMsg}`, 'warn');
      }
    }

    // Iteration 41: Comprehensive completion summary with performance metrics
    const totalTime = Date.now() - startTime;
    const avgTime = totalProcessingTime / (updatedCount + skippedCount + errorCount || 1);
    const successRate = ((updatedCount + skippedCount) / relevantNodes.length * 100).toFixed(1);

    await this.runManager.log(
      runId,
      `Production mode complete: ${updatedCount} updated, ${skippedCount} unchanged, ${errorCount} errors (${successRate}% success, ${totalTime}ms total, ${avgTime.toFixed(0)}ms avg/node)`,
      'info'
    );

    // Iteration 42: Domain statistics logging
    if (domainStats.size > 0) {
      const domainSummary = Array.from(domainStats.entries())
        .map(([domain, stats]) => `${domain}: ${stats.count} requests, ${stats.errors} errors`)
        .join('; ');
      await this.runManager.log(runId, `Domain statistics: ${domainSummary}`, 'debug');
    }

    return documents;
  }

  /**
   * Helper to process a single node for production mode scraping
   */
  private async processSingleNode(
    node: NavigationNode,
    runId: string,
    kbManager: KnowledgeBaseManager,
    domainStats: Map<string, { count: number; errors: number }>,
    skipGraphUpdate: boolean = false
  ): Promise<{ status: 'updated' | 'skipped' | 'error' | 'new', processingTime: number, document?: ScrapedDocument, updatedNode?: any }> {
    const nodeStartTime = Date.now();
    const domain = new URL(node.url).hostname;

    // Iteration 30: Domain-based statistics tracking
    if (!domainStats.has(domain)) {
      domainStats.set(domain, { count: 0, errors: 0 });
    }
    domainStats.get(domain)!.count++;

    try {
      // Iteration 31: Enhanced request headers with referer
      const response = await axios.get(node.url, {
        timeout: TIMEOUTS.MEDIUM, // 30 seconds
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Beleidsscan/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8'
        }
      });

      const html = response.data;

      // Iteration 32: Content size validation
      if (html.length === 0) {
        throw new BadRequestError('Empty response received', {
          reason: 'empty_response',
          operation: 'scrapeWebsite',
          url: node.url
        });
      }

      // Iteration 33: Lazy import optimization
      const { MarkdownConverter } = await import('../../ingestion/processing/MarkdownConverter.js');
      const converter = new MarkdownConverter();
      const markdown = converter.convert(html);
      const metadata = converter.extractMetadata(html, node.url);

      // US-012: Add source metadata for multi-source support
      const sourceMetadata = getSourceMetadata(node.url, node.title);
      metadata.source = sourceMetadata.sourceType;
      metadata.authority_level = sourceMetadata.authorityLevel;
      if (sourceMetadata.municipalityName) {
        metadata.municipality_name = sourceMetadata.municipalityName as string;
      }
      if (sourceMetadata.provinceName) {
        metadata.province_name = sourceMetadata.provinceName as string;
      }

      // Iteration 34: Enhanced metadata validation
      if (!metadata.title && !node.title) {
        await this.runManager.log(runId, `[i18n:workflowLogs.missingTitleFallback]|${node.url}`, 'warn');
      }

      // Iteration 35: Optimized savePage call with error handling
      const saveResult = await kbManager.savePage(metadata, markdown);

      const nodeProcessingTime = Date.now() - nodeStartTime;

      // US-010: Update navigation graph node's lastVisited timestamp
      // This tracks when we last checked/scraped the page, regardless of whether content changed
      const currentTimestamp = new Date().toISOString();
      const updatedNode = {
        ...node,
        lastVisited: currentTimestamp
      };

      if (!skipGraphUpdate) {
        try {
          await this.navigationGraph.addNode(updatedNode);
        } catch (error) {
          // Log but don't fail if graph update fails
          await this.runManager.log(
            runId,
            `⚠️ Failed to update navigation graph lastVisited for ${node.url}: ${error instanceof Error ? error.message : String(error)}`,
            'warn'
          );
        }
      }

      let status: 'updated' | 'skipped' | 'new';
      let doc: ScrapedDocument | undefined;

      // Iteration 36: Detailed status logging with timing
      if (saveResult.wasSkipped) {
        status = 'skipped';
        await this.runManager.log(runId, `[i18n:workflowLogs.skippedUnchanged]|${node.url}|${nodeProcessingTime}`, 'debug');
      } else {
        status = saveResult.wasUpdated ? 'updated' : 'new';
        const nodeStatusKey = status === 'updated' ? 'workflowLogs.nodeUpdated' : 'workflowLogs.nodeNew';
        await this.runManager.log(runId, `[i18n:${nodeStatusKey}]|${node.url}|${nodeProcessingTime}`, 'info');

        // Iteration 37: Enhanced document creation with validation
        doc = {
          titel: metadata.title || node.title || 'Untitled',
          url: node.url,
          website_url: new URL(node.url).origin,
          samenvatting: metadata.description || '',
          type_document: 'Webpagina',
          publicatiedatum: (metadata as { publicationDate?: string }).publicationDate || null,
          sourceType: sourceMetadata.sourceType as SourceType,
          authorityLevel: sourceMetadata.authorityLevel,
          municipalityName: sourceMetadata.municipalityName,
          provinceName: sourceMetadata.provinceName
        };
      }

      return { status, processingTime: nodeProcessingTime, document: doc, updatedNode: skipGraphUpdate ? updatedNode : undefined };

    } catch (error) {
      // Iteration 39: Enhanced error handling with categorization
      domainStats.get(domain)!.errors++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorType = axios.isAxiosError(error) ? `HTTP ${error.response?.status || 'Network'}` : 'Unknown';
      await this.runManager.log(runId, `[i18n:workflowLogs.errorProcessingNode]|${node.url}|${errorType}|${errorMsg}`, 'error');

      return { status: 'error', processingTime: Date.now() - nodeStartTime };
    }
  }
}
