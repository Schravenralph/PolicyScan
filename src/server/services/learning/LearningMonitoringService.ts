/**
 * Learning Monitoring Service
 * 
 * Tracks quality metrics, feedback volume, and learning task execution
 * for the continuous learning system. Provides data for monitoring dashboards
 * and alerting services.
 * 
 * This service implements Step 5.3 from the continuous learning improvement plan.
 */

import { getDB, ensureDBConnection } from '../../config/database.js';
import type { Db } from '../../config/database.js';
import { QualityMetrics } from '../feedback/FeedbackAnalysisService.js';
import { withTimeout, DEFAULT_TIMEOUTS } from '../../utils/withTimeout.js';

export interface LearningTaskExecution {
  taskType: 'ranking_update' | 'dictionary_update' | 'source_update' | 'monthly_review' | 'learning_cycle';
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  status: 'running' | 'completed' | 'failed' | 'timeout';
  error?: string;
  results?: {
    rankingBoosts?: number;
    dictionaryUpdates?: number;
    sourceUpdates?: number;
    metrics?: QualityMetrics;
  };
}

export interface FeedbackVolumeMetrics {
  date: Date;
  interactions: number;
  documentFeedback: number;
  qaFeedback: number;
  totalFeedback: number;
}

export interface QualityTrend {
  date: Date;
  overallCTR: number;
  overallAcceptanceRate: number;
  averageDocumentQuality: number;
  averageSourceQuality: number;
  documentCount: number;
  sourceCount: number;
}

export interface LearningMonitoringData {
  currentQuality: QualityMetrics;
  qualityTrends: QualityTrend[];
  feedbackVolume: FeedbackVolumeMetrics[];
  recentTaskExecutions: LearningTaskExecution[];
  summary: {
    totalTasksRun: number;
    successfulTasks: number;
    failedTasks: number;
    averageTaskDuration: number;
    lastTaskRun?: Date;
  };
}

export class LearningMonitoringService {
  private _db: Db | null = null;
  private taskExecutions: Map<string, LearningTaskExecution> = new Map();

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
   * Track the start of a learning task execution
   */
  startTaskExecution(taskType: LearningTaskExecution['taskType']): string {
    const taskId = `${taskType}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const execution: LearningTaskExecution = {
      taskType,
      startTime: new Date(),
      status: 'running'
    };
    this.taskExecutions.set(taskId, execution);
    return taskId;
  }

  /**
   * Track the completion of a learning task execution
   */
  completeTaskExecution(
    taskId: string,
    status: 'completed' | 'failed' | 'timeout',
    results?: LearningTaskExecution['results'],
    error?: string
  ): void {
    const execution = this.taskExecutions.get(taskId);
    if (!execution) {
      console.warn(`[LearningMonitoringService] Task execution ${taskId} not found`);
      return;
    }

    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
    execution.status = status;
    execution.results = results;
    execution.error = error;

    // Store in database for historical tracking
    this.storeTaskExecution(execution).catch(err => {
      console.error('[LearningMonitoringService] Error storing task execution:', err);
    });

    // Keep only last 100 executions in memory
    if (this.taskExecutions.size > 100) {
      const oldestKey = Array.from(this.taskExecutions.entries())
        .sort((a, b) => a[1].startTime.getTime() - b[1].startTime.getTime())[0][0];
      this.taskExecutions.delete(oldestKey);
    }
  }

  /**
   * Store task execution in database for historical tracking
   */
  private async storeTaskExecution(execution: LearningTaskExecution): Promise<void> {
    try {
      const db = await this.getDB();
      await withTimeout(
        db.collection('learning_task_executions').insertOne({
          ...execution,
          _id: undefined,
          createdAt: new Date()
        }),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'storeTaskExecution'
      );
    } catch (error) {
      console.error('[LearningMonitoringService] Error storing task execution:', error);
      // Don't throw - monitoring should not break learning operations
    }
  }

  /**
   * Get feedback volume metrics for a date range
   */
  async getFeedbackVolume(startDate: Date, endDate: Date): Promise<FeedbackVolumeMetrics[]> {
    try {
      const db = await this.getDB();
      
      const interactions = await withTimeout(
        db.collection('user_interactions')
          .aggregate([
            {
              $match: {
                timestamp: { $gte: startDate, $lte: endDate }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ])
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'getFeedbackVolume: interactions'
      );

      const documentFeedback = await withTimeout(
        db.collection('document_feedback')
          .aggregate([
            {
              $match: {
                timestamp: { $gte: startDate, $lte: endDate }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ])
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'getFeedbackVolume: document_feedback'
      );

      const qaFeedback = await withTimeout(
        db.collection('qa_feedback')
          .aggregate([
            {
              $match: {
                timestamp: { $gte: startDate, $lte: endDate }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ])
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'getFeedbackVolume: qa_feedback'
      );

      // Combine results by date
      const dateMap = new Map<string, FeedbackVolumeMetrics>();
      
      (interactions as Array<{ _id: string; count: number }>).forEach(item => {
        const date = new Date(item._id);
        dateMap.set(item._id, {
          date,
          interactions: item.count,
          documentFeedback: 0,
          qaFeedback: 0,
          totalFeedback: item.count
        });
      });

      (documentFeedback as Array<{ _id: string; count: number }>).forEach(item => {
        const existing = dateMap.get(item._id);
        if (existing) {
          existing.documentFeedback = item.count;
          existing.totalFeedback += item.count;
        } else {
          const date = new Date(item._id);
          dateMap.set(item._id, {
            date,
            interactions: 0,
            documentFeedback: item.count,
            qaFeedback: 0,
            totalFeedback: item.count
          });
        }
      });

      (qaFeedback as Array<{ _id: string; count: number }>).forEach(item => {
        const existing = dateMap.get(item._id);
        if (existing) {
          existing.qaFeedback = item.count;
          existing.totalFeedback += item.count;
        } else {
          const date = new Date(item._id);
          dateMap.set(item._id, {
            date,
            interactions: 0,
            documentFeedback: 0,
            qaFeedback: item.count,
            totalFeedback: item.count
          });
        }
      });

      return Array.from(dateMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      console.error('[LearningMonitoringService] Error getting feedback volume:', error);
      return [];
    }
  }

  /**
   * Get quality trends over time
   */
  async getQualityTrends(startDate: Date, endDate: Date): Promise<QualityTrend[]> {
    try {
      const db = await this.getDB();
      
      // Get daily quality snapshots from stored metrics
      const trends = await withTimeout(
        db.collection('learning_quality_snapshots')
          .find({
            date: { $gte: startDate, $lte: endDate }
          })
          .sort({ date: 1 })
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'getQualityTrends'
      );

      return (trends as unknown as Array<{
        date: Date;
        overallCTR: number;
        overallAcceptanceRate: number;
        averageDocumentQuality: number;
        averageSourceQuality: number;
        documentCount: number;
        sourceCount: number;
      }>).map(t => ({
        date: t.date instanceof Date ? t.date : new Date(t.date),
        overallCTR: t.overallCTR || 0,
        overallAcceptanceRate: t.overallAcceptanceRate || 0,
        averageDocumentQuality: t.averageDocumentQuality || 0,
        averageSourceQuality: t.averageSourceQuality || 0,
        documentCount: t.documentCount || 0,
        sourceCount: t.sourceCount || 0
      }));
    } catch (error) {
      console.error('[LearningMonitoringService] Error getting quality trends:', error);
      return [];
    }
  }

  /**
   * Store a quality snapshot for trend tracking
   */
  async storeQualitySnapshot(metrics: QualityMetrics): Promise<void> {
    try {
      const db = await this.getDB();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const averageDocumentQuality = metrics.documentQuality.length > 0
        ? metrics.documentQuality.reduce((sum, d) => sum + d.qualityScore, 0) / metrics.documentQuality.length
        : 0;

      const averageSourceQuality = metrics.sourceQuality.length > 0
        ? metrics.sourceQuality.reduce((sum, s) => sum + s.qualityScore, 0) / metrics.sourceQuality.length
        : 0;

      const snapshot = {
        date: today,
        overallCTR: metrics.overallCTR,
        overallAcceptanceRate: metrics.overallAcceptanceRate,
        averageDocumentQuality,
        averageSourceQuality,
        documentCount: metrics.documentQuality.length,
        sourceCount: metrics.sourceQuality.length,
        createdAt: new Date()
      };

      // Upsert to avoid duplicates
      await withTimeout(
        db.collection('learning_quality_snapshots').updateOne(
          { date: today },
          { $set: snapshot },
          { upsert: true }
        ),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'storeQualitySnapshot'
      );
    } catch (error) {
      console.error('[LearningMonitoringService] Error storing quality snapshot:', error);
      // Don't throw - monitoring should not break learning operations
    }
  }

  /**
   * Get recent task executions
   */
  getRecentTaskExecutions(limit: number = 50): LearningTaskExecution[] {
    return Array.from(this.taskExecutions.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  /**
   * Get task execution summary
   */
  async getTaskExecutionSummary(days: number = 30): Promise<LearningMonitoringData['summary']> {
    try {
      const db = await this.getDB();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const tasks = await withTimeout(
        db.collection('learning_task_executions')
          .find({
            startTime: { $gte: cutoffDate }
          })
          .toArray(),
        DEFAULT_TIMEOUTS.DB_QUERY,
        'getTaskExecutionSummary'
      );

      const totalTasks = tasks.length;
      const successfulTasks = (tasks as unknown as Array<{ status: string }>).filter(t => t.status === 'completed').length;
      const failedTasks = (tasks as unknown as Array<{ status: string }>).filter(t => 
        t.status === 'failed' || t.status === 'timeout'
      ).length;

      const durations = (tasks as Array<{ duration?: number }>)
        .map(t => t.duration)
        .filter((d): d is number => typeof d === 'number');
      const averageDuration = durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

      const lastTask = tasks.length > 0
        ? (tasks as unknown as Array<{ startTime: Date | string }>)
            .sort((a, b) => {
              const aTime = a.startTime instanceof Date ? a.startTime.getTime() : new Date(a.startTime).getTime();
              const bTime = b.startTime instanceof Date ? b.startTime.getTime() : new Date(b.startTime).getTime();
              return bTime - aTime;
            })[0]
        : null;

      return {
        totalTasksRun: totalTasks,
        successfulTasks,
        failedTasks,
        averageTaskDuration: averageDuration,
        lastTaskRun: lastTask
          ? (lastTask.startTime instanceof Date ? lastTask.startTime : new Date(lastTask.startTime))
          : undefined
      };
    } catch (error) {
      console.error('[LearningMonitoringService] Error getting task execution summary:', error);
      return {
        totalTasksRun: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageTaskDuration: 0
      };
    }
  }

  /**
   * Get comprehensive monitoring data
   */
  async getMonitoringData(
    currentQuality: QualityMetrics,
    days: number = 30
  ): Promise<LearningMonitoringData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [qualityTrends, feedbackVolume, summary] = await Promise.all([
      this.getQualityTrends(startDate, endDate),
      this.getFeedbackVolume(startDate, endDate),
      this.getTaskExecutionSummary(days)
    ]);

    return {
      currentQuality,
      qualityTrends,
      feedbackVolume,
      recentTaskExecutions: this.getRecentTaskExecutions(50),
      summary
    };
  }

  /**
   * Initialize database indexes for monitoring collections
   */
  async initializeIndexes(): Promise<void> {
    try {
      const db = await this.getDB();
      
      // Indexes for learning_task_executions
      await db.collection('learning_task_executions').createIndexes([
        { key: { taskType: 1, startTime: -1 } },
        { key: { status: 1, startTime: -1 } },
        { key: { startTime: -1 } }
      ]);

      // Indexes for learning_quality_snapshots
      await db.collection('learning_quality_snapshots').createIndexes([
        { key: { date: 1 }, unique: true }
      ]);

      console.log('[LearningMonitoringService] Indexes initialized');
    } catch (error) {
      console.error('[LearningMonitoringService] Error initializing indexes:', error);
      // Don't throw - indexes are optional optimizations
    }
  }
}



