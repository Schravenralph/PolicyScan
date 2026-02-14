/**
 * Dashboard Data Storage Service
 * 
 * Handles storage of dashboard JSON data to disk for client-side consumption.
 * Stores aggregated test result data in public/test-results/ for serving.
 * 
 * Single Responsibility: Store dashboard data to disk only.
 * 
 * @module src/server/services/testing/storage/DashboardDataStorageService
 */

import { logger } from '../../../utils/logger.js';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import type { TestRun } from '../TestPerformanceAnalyticsService.js';

const DASHBOARD_DATA_PATH = join(process.cwd(), 'test-results', 'dashboard-data.json');
const PUBLIC_DASHBOARD_DATA_PATH = join(process.cwd(), 'public', 'test-results', 'dashboard-data.json');

/**
 * Dashboard data structure
 */
export interface DashboardData {
  recentRuns?: TestRun[];
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  };
  lastUpdated?: string;
  [key: string]: unknown;
}

/**
 * Service for storing dashboard data to disk
 * 
 * This service handles ONLY storage of dashboard data to disk.
 * It does NOT handle:
 * - Data aggregation (handled by analytics services)
 * - Routing decisions (handled by TestResultIngestionService)
 * - Data retrieval (handled by API routes)
 */
export class DashboardDataStorageService {
  private static instance: DashboardDataStorageService | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DashboardDataStorageService {
    if (!DashboardDataStorageService.instance) {
      DashboardDataStorageService.instance = new DashboardDataStorageService();
    }
    return DashboardDataStorageService.instance;
  }

  /**
   * Ensure directories exist
   */
  private ensureDirectories(): void {
    const dirs = [
      join(process.cwd(), 'test-results'),
      join(process.cwd(), 'public', 'test-results'),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Save dashboard data to disk
   * 
   * @param data Dashboard data to save
   * @param saveToPublic Whether to also save to public directory (default: true)
   */
  async save(data: DashboardData, saveToPublic: boolean = true): Promise<void> {
    try {
      this.ensureDirectories();

      // Add last updated timestamp
      const dataWithTimestamp: DashboardData = {
        ...data,
        lastUpdated: new Date().toISOString(),
      };

      // Save to test-results directory
      writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dataWithTimestamp, null, 2));
      logger.debug({ path: DASHBOARD_DATA_PATH }, 'Dashboard data saved to test-results');

      // Also save to public directory if requested
      if (saveToPublic) {
        writeFileSync(PUBLIC_DASHBOARD_DATA_PATH, JSON.stringify(dataWithTimestamp, null, 2));
        logger.debug({ path: PUBLIC_DASHBOARD_DATA_PATH }, 'Dashboard data saved to public');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save dashboard data');
      throw error;
    }
  }

  /**
   * Load dashboard data from disk
   * 
   * @param fromPublic Whether to load from public directory (default: false)
   * @returns Dashboard data or null if not found
   */
  async load(fromPublic: boolean = false): Promise<DashboardData | null> {
    try {
      const path = fromPublic ? PUBLIC_DASHBOARD_DATA_PATH : DASHBOARD_DATA_PATH;
      
      if (!existsSync(path)) {
        return null;
      }

      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as DashboardData;
    } catch (error) {
      logger.warn({ error }, 'Failed to load dashboard data');
      return null;
    }
  }

  /**
   * Add test run to dashboard data
   * 
   * @param run Test run to add
   * @param maxRuns Maximum number of recent runs to keep (default: 100)
   */
  async addRun(run: TestRun, maxRuns: number = 100): Promise<void> {
    try {
      const data = await this.load() || { recentRuns: [] };
      
      if (!data.recentRuns) {
        data.recentRuns = [];
      }

      // Add new run at the beginning
      data.recentRuns.unshift(run);

      // Keep only the most recent runs
      if (data.recentRuns.length > maxRuns) {
        data.recentRuns = data.recentRuns.slice(0, maxRuns);
      }

      // Update summary
      const total = data.recentRuns.length;
      const passed = data.recentRuns.filter(r => (r.results?.passed || 0) > 0 && (r.results?.failed || 0) === 0).length;
      const failed = data.recentRuns.filter(r => (r.results?.failed || 0) > 0).length;
      const skipped = data.recentRuns.filter(r => (r.results?.skipped || 0) > 0).length;

      data.summary = {
        total,
        passed,
        failed,
        skipped,
        passRate: total > 0 ? (passed / total) * 100 : 0,
      };

      await this.save(data);
      logger.debug({ runId: run.id }, 'Test run added to dashboard data');
    } catch (error) {
      logger.error({ error, runId: run.id }, 'Failed to add test run to dashboard data');
      throw error;
    }
  }
}

/**
 * Get singleton instance of DashboardDataStorageService
 */
export function getDashboardDataStorageService(): DashboardDataStorageService {
  return DashboardDataStorageService.getInstance();
}
