import { ensureDBConnection } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { Cache } from '../infrastructure/cache.js';
import crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getGitInfoAsync, getCICDInfo } from '../../utils/testRunnerUtils.js';

const COLLECTION_NAME = 'test_coverage';

// Cache configuration
const CACHE_TTL = parseInt(process.env.TEST_COVERAGE_CACHE_TTL || '300000', 10); // 5 minutes default
const CACHE_MAX_SIZE = parseInt(process.env.TEST_COVERAGE_CACHE_MAX_SIZE || '100', 10);

export interface CoverageMetrics {
  lines: { total: number; covered: number; skipped: number; pct: number };
  statements: { total: number; covered: number; skipped: number; pct: number };
  functions: { total: number; covered: number; skipped: number; pct: number };
  branches: { total: number; covered: number; skipped: number; pct: number };
}

export interface TestCoverageDocument {
  _id?: string;
  runId: string;
  timestamp: Date;
  summary: CoverageMetrics;
  modules: Record<string, CoverageMetrics>;
  git?: {
    branch: string;
    commit: string;
    author: string;
    message: string;
  };
  cicd?: {
    jobId: string;
    buildId: string;
    url: string;
  };
  createdAt: Date;
  expiresAt: Date; // TTL 90 days
}

export interface CoverageResponse {
  summary: CoverageMetrics;
  trends: Array<{
    timestamp: string;
    summary: CoverageMetrics;
    runId: string;
  }>;
  byType: Record<string, CoverageMetrics>;
  modules: Record<string, CoverageMetrics>;
}

export class TestCoverageService {
  private static instance: TestCoverageService | null = null;
  private cache: Cache<unknown>;
  private indexesEnsured = false;

  private constructor() {
    this.cache = new Cache(CACHE_MAX_SIZE, CACHE_TTL, 'test-coverage-service');
  }

  static getInstance(): TestCoverageService {
    if (!TestCoverageService.instance) {
      TestCoverageService.instance = new TestCoverageService();
    }
    return TestCoverageService.instance;
  }

  /**
   * Ensure TTL index exists
   */
  async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;

    const db = await ensureDBConnection();
    const collection = db.collection<TestCoverageDocument>(COLLECTION_NAME);

    try {
      await collection.createIndex(
        { expiresAt: 1 },
        {
          expireAfterSeconds: 0,
          name: 'test_coverage_ttl_index',
          background: true,
        }
      );
      await collection.createIndex({ timestamp: -1 }, { background: true });
      await collection.createIndex({ runId: 1 }, { unique: true, background: true });
      logger.info('TestCoverage indexes created/verified');
      this.indexesEnsured = true;
    } catch (error) {
      if (error instanceof Error && !error.message.includes('already exists')) {
        logger.warn({ error }, 'Failed to create TestCoverage indexes');
      }
    }
  }

  private getCacheKey(prefix: string, params: Record<string, unknown>): string {
    const paramString = JSON.stringify(params);
    const hash = crypto.createHash('sha256').update(paramString).digest('hex').substring(0, 16);
    return `test-coverage:${prefix}:${hash}`;
  }

  /**
   * Get the path to the coverage file
   */
  private getCoverageFilePath(): string {
    return process.env.COVERAGE_FILE_PATH || join(process.cwd(), 'coverage', 'coverage-summary.json');
  }

  /**
   * Ingest coverage from file system if available and not already indexed
   */
  async ingestCoverageFromFile(): Promise<TestCoverageDocument | null> {
    const coveragePath = this.getCoverageFilePath();

    if (!existsSync(coveragePath)) {
      return null;
    }

    try {
      const content = readFileSync(coveragePath, 'utf-8');
      const data = JSON.parse(content);

      if (!data || !data.total) {
        return null;
      }

      // Generate a runId based on content hash or file timestamp?
      // Ideally we want to link it to a test run.
      // For now, let's use a hash of the summary to detect changes, or file mtime.
      // Or just always try to save and rely on runId from somewhere else?
      // Since this is "lazy" ingest called from GET, we might create duplicates if we strictly use timestamp.
      // Let's check the dashboard-data.json for the last runId, or create a synthetic one based on timestamp.

      // Better approach: use file mtime as timestamp.
      const stats = await import('fs/promises').then(fs => fs.stat(coveragePath));
      const timestamp = stats.mtime;

      // Check if we have a document with this timestamp (fuzzy match or exact)
      // Or just create a hash of the data + timestamp
      const dataHash = crypto.createHash('sha256').update(JSON.stringify(data.total) + timestamp.toISOString()).digest('hex').substring(0, 12);
      const runId = `coverage-${timestamp.getTime()}-${dataHash}`;

      const db = await ensureDBConnection();
      const collection = db.collection<TestCoverageDocument>(COLLECTION_NAME);

      const existing = await collection.findOne({ runId });
      if (existing) {
        return existing;
      }

      // Separate total from modules
      const { total, ...modules } = data;

      const gitInfo = await getGitInfoAsync();
      const cicdInfo = getCICDInfo();
      
      const doc: TestCoverageDocument = {
        runId,
        timestamp,
        summary: total,
        modules,
        git: {
          branch: gitInfo.branch,
          commit: gitInfo.commitHash,
          author: 'unknown', // GitInfo doesn't provide author
          message: 'unknown', // GitInfo doesn't provide message
        },
        cicd: cicdInfo ? {
          jobId: cicdInfo.buildId || cicdInfo.buildNumber || 'unknown',
          buildId: cicdInfo.buildId || cicdInfo.buildNumber || 'unknown',
          url: cicdInfo.workflowRunId ? `https://github.com/actions/runs/${cicdInfo.workflowRunId}` : 'unknown',
        } : undefined,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      };

      await collection.insertOne(doc);
      await this.cache.clear(); // Invalidate cache

      return doc;
    } catch (error) {
      logger.error({ error }, 'Failed to ingest coverage from file');
      return null;
    }
  }

  /**
   * Calculate coverage by type (server, client, shared) based on file paths
   */
  private calculateCoverageByType(modules: Record<string, CoverageMetrics>): Record<string, CoverageMetrics> {
    const byType: Record<string, { lines: number[], statements: number[], functions: number[], branches: number[] }> = {
      server: { lines: [0, 0], statements: [0, 0], functions: [0, 0], branches: [0, 0] }, // [covered, total]
      client: { lines: [0, 0], statements: [0, 0], functions: [0, 0], branches: [0, 0] },
      shared: { lines: [0, 0], statements: [0, 0], functions: [0, 0], branches: [0, 0] },
      other: { lines: [0, 0], statements: [0, 0], functions: [0, 0], branches: [0, 0] },
    };

    for (const [path, metrics] of Object.entries(modules)) {
      let type = 'other';
      if (path.includes('/server/') || path.includes('\\server\\')) type = 'server';
      else if (path.includes('/client/') || path.includes('\\client\\')) type = 'client';
      else if (path.includes('/shared/') || path.includes('\\shared\\')) type = 'shared';

      byType[type].lines[0] += metrics.lines.covered;
      byType[type].lines[1] += metrics.lines.total;
      byType[type].statements[0] += metrics.statements.covered;
      byType[type].statements[1] += metrics.statements.total;
      byType[type].functions[0] += metrics.functions.covered;
      byType[type].functions[1] += metrics.functions.total;
      byType[type].branches[0] += metrics.branches.covered;
      byType[type].branches[1] += metrics.branches.total;
    }

    // Calculate percentages
    const result: Record<string, CoverageMetrics> = {};
    for (const [type, counts] of Object.entries(byType)) {
      if (counts.lines[1] === 0 && counts.statements[1] === 0 && counts.functions[1] === 0 && counts.branches[1] === 0) {
        continue; // Skip empty types
      }
      result[type] = {
        lines: {
          total: counts.lines[1],
          covered: counts.lines[0],
          skipped: 0,
          pct: counts.lines[1] > 0 ? (counts.lines[0] / counts.lines[1]) * 100 : 0
        },
        statements: {
          total: counts.statements[1],
          covered: counts.statements[0],
          skipped: 0,
          pct: counts.statements[1] > 0 ? (counts.statements[0] / counts.statements[1]) * 100 : 0
        },
        functions: {
          total: counts.functions[1],
          covered: counts.functions[0],
          skipped: 0,
          pct: counts.functions[1] > 0 ? (counts.functions[0] / counts.functions[1]) * 100 : 0
        },
        branches: {
          total: counts.branches[1],
          covered: counts.branches[0],
          skipped: 0,
          pct: counts.branches[1] > 0 ? (counts.branches[0] / counts.branches[1]) * 100 : 0
        },
      };
    }
    return result;
  }

  /**
   * Ingest coverage data directly (not from file)
   * 
   * This method allows direct ingestion of coverage data, typically called
   * from TestResultIngestionService when test results are ingested.
   * 
   * @param input Coverage data to ingest
   */
  async ingestCoverageDirectly(input: {
    runId: string;
    timestamp: Date;
    summary: CoverageMetrics;
    modules?: Record<string, CoverageMetrics>;
  }): Promise<TestCoverageDocument> {
    await this.ensureIndexes();

    const db = await ensureDBConnection();
    const collection = db.collection<TestCoverageDocument>(COLLECTION_NAME);

    // Check if document with this runId already exists
    const existing = await collection.findOne({ runId: input.runId });
    if (existing) {
      logger.debug({ runId: input.runId }, 'Coverage document already exists, skipping ingestion');
      return existing;
    }

    const gitInfo = await getGitInfoAsync();
    const cicdInfo = getCICDInfo();

    const doc: TestCoverageDocument = {
      runId: input.runId,
      timestamp: input.timestamp,
      summary: input.summary,
      modules: input.modules || {},
      git: {
        branch: gitInfo.branch,
        commit: gitInfo.commitHash,
        author: 'unknown', // GitInfo doesn't provide author
        message: 'unknown', // GitInfo doesn't provide message
      },
      cicd: cicdInfo ? {
        jobId: cicdInfo.buildId || cicdInfo.buildNumber || 'unknown',
        buildId: cicdInfo.buildId || cicdInfo.buildNumber || 'unknown',
        url: cicdInfo.workflowRunId ? `https://github.com/actions/runs/${cicdInfo.workflowRunId}` : 'unknown',
      } : undefined,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    await collection.insertOne(doc);
    await this.cache.clear(); // Invalidate cache

    logger.info({ runId: input.runId }, 'Coverage data ingested directly');
    return doc;
  }

  /**
   * Get coverage metrics including summary, trends, and breakdown
   */
  async getCoverageMetrics(timeRangeDays: number = 30): Promise<CoverageResponse | null> {
    const cacheKey = this.getCacheKey('metrics', { timeRangeDays });
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached as CoverageResponse;
    }

    // Try to ingest latest first
    await this.ingestCoverageFromFile();

    const db = await ensureDBConnection();
    const collection = db.collection<TestCoverageDocument>(COLLECTION_NAME);

    // Get latest document
    const [latest] = await collection.find({}).sort({ timestamp: -1 }).limit(1).toArray();

    if (!latest) {
      return null;
    }

    // Get trends
    const cutoffDate = new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000);
    const history = await collection
      .find({ timestamp: { $gte: cutoffDate } })
      .sort({ timestamp: 1 })
      .project({ timestamp: 1, summary: 1, runId: 1 })
      .toArray();

    const trends = history.map(h => ({
      timestamp: h.timestamp.toISOString(),
      summary: h.summary,
      runId: h.runId,
    }));

    // Calculate byType
    const byType = this.calculateCoverageByType(latest.modules);

    const result: CoverageResponse = {
      summary: latest.summary,
      trends,
      byType,
      modules: latest.modules,
    };

    await this.cache.set(cacheKey, result);
    return result;
  }
}

export function getTestCoverageService(): TestCoverageService {
  return TestCoverageService.getInstance();
}
