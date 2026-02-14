/**
 * Cost Monitoring Service
 * 
 * Monitors costs, detects budget thresholds, cost spikes, and budget overruns.
 * Sends alerts via AlertingService and NotificationService.
 */

import { logger } from '../../utils/logger.js';
import { getDB } from '../../config/database.js';
import { AlertingService } from './AlertingService.js';
import { getNotificationService } from '../NotificationService.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface BudgetConfig {
  total: number; // USD per month
  categories: {
    api: number;
    databases: number;
    cicd: number;
  };
  thresholds: {
    warning: number; // percentage (e.g., 80)
    critical: number; // percentage (e.g., 95)
  };
}

export interface CostData {
  total: number;
  monthlyProjection: number;
  byCategory: {
    api: number;
    databases: number;
    cicd: number;
  };
  timestamp: Date;
}

export interface CostAlert {
  type: 'budget_threshold' | 'budget_overrun' | 'cost_spike' | 'category_overrun';
  severity: 'warning' | 'critical';
  message: string;
  category?: 'api' | 'databases' | 'cicd' | 'total';
  currentValue: number;
  threshold: number;
  percentage: number;
  timestamp: Date;
}

// Default budget configuration
const DEFAULT_BUDGET: BudgetConfig = {
  total: 1000, // USD per month
  categories: {
    api: 500,
    databases: 300,
    cicd: 200,
  },
  thresholds: {
    warning: 80,
    critical: 95,
  },
};

// Cost spike threshold (150% increase)
const COST_SPIKE_THRESHOLD = 1.5;

export class CostMonitoringService {
  private alertingService: AlertingService;
  private budget: BudgetConfig;
  private alertCooldownMs: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(budget?: BudgetConfig) {
    this.alertingService = new AlertingService();
    this.budget = budget || this.loadBudgetConfig();
  }

  /**
   * Load budget configuration from file or use defaults
   */
  private loadBudgetConfig(): BudgetConfig {
    const configPath = join(process.cwd(), 'cost-budget-config.json');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        return { ...DEFAULT_BUDGET, ...config };
      } catch (error) {
        logger.warn({ error }, 'Failed to load budget config, using defaults');
      }
    }
    return DEFAULT_BUDGET;
  }

  /**
   * Load current cost data from reports
   */
  private loadCostData(): CostData | null {
    try {
      const reportPath = join(process.cwd(), 'total-costs-report.json');
      if (!existsSync(reportPath)) {
        return null;
      }

      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      return {
        total: report.costs?.total || 0,
        monthlyProjection: report.trends?.monthlyProjection || 0,
        byCategory: {
          api: report.costs?.api || 0,
          databases: report.costs?.databases || 0,
          cicd: report.costs?.cicd || 0,
        },
        timestamp: new Date(report.timestamp || Date.now()),
      };
    } catch (error) {
      logger.warn({ error }, 'Could not load cost data');
      return null;
    }
  }

  /**
   * Load previous cost data for spike detection
   */
  private async loadPreviousCostData(): Promise<CostData | null> {
    try {
      const db = getDB();
      const previousAlert = await db.collection('cost_alerts').findOne(
        { type: 'cost_spike' },
        { sort: { timestamp: -1 } }
      );

      if (previousAlert && previousAlert.costData) {
        return previousAlert.costData as CostData;
      }

      // Try to load from previous report if available
      // (In production, this would query historical cost data)
      return null;
    } catch (error) {
      logger.warn({ error }, 'Could not load previous cost data');
      return null;
    }
  }

  /**
   * Check for cost alerts
   */
  async checkCostAlerts(): Promise<CostAlert[]> {
    const alerts: CostAlert[] = [];
    const costData = this.loadCostData();

    if (!costData) {
      logger.warn('No cost data available for alert checking');
      return alerts;
    }

    // Check budget thresholds
    const totalUsed = (costData.monthlyProjection / this.budget.total) * 100;
    
    if (totalUsed >= 100) {
      alerts.push({
        type: 'budget_overrun',
        severity: 'critical',
        message: `Budget exceeded: ${totalUsed.toFixed(1)}% used ($${costData.monthlyProjection.toFixed(2)} / $${this.budget.total})`,
        category: 'total',
        currentValue: costData.monthlyProjection,
        threshold: this.budget.total,
        percentage: totalUsed,
        timestamp: new Date(),
      });
    } else if (totalUsed >= this.budget.thresholds.critical) {
      alerts.push({
        type: 'budget_threshold',
        severity: 'critical',
        message: `Critical: ${totalUsed.toFixed(1)}% of budget used ($${costData.monthlyProjection.toFixed(2)} / $${this.budget.total})`,
        category: 'total',
        currentValue: costData.monthlyProjection,
        threshold: this.budget.total,
        percentage: totalUsed,
        timestamp: new Date(),
      });
    } else if (totalUsed >= this.budget.thresholds.warning) {
      alerts.push({
        type: 'budget_threshold',
        severity: 'warning',
        message: `Warning: ${totalUsed.toFixed(1)}% of budget used ($${costData.monthlyProjection.toFixed(2)} / $${this.budget.total})`,
        category: 'total',
        currentValue: costData.monthlyProjection,
        threshold: this.budget.total,
        percentage: totalUsed,
        timestamp: new Date(),
      });
    }

    // Check category-specific overruns
    const categories: Array<'api' | 'databases' | 'cicd'> = ['api', 'databases', 'cicd'];
    for (const category of categories) {
      const categoryBudget = this.budget.categories[category];
      const categoryCost = costData.byCategory[category];
      const categoryUsed = (categoryCost / categoryBudget) * 100;

      if (categoryUsed >= 100) {
        alerts.push({
          type: 'category_overrun',
          severity: 'critical',
          message: `${category.toUpperCase()} budget exceeded: ${categoryUsed.toFixed(1)}% used ($${categoryCost.toFixed(2)} / $${categoryBudget})`,
          category,
          currentValue: categoryCost,
          threshold: categoryBudget,
          percentage: categoryUsed,
          timestamp: new Date(),
        });
      }
    }

    // Check for cost spikes
    const previousCostData = await this.loadPreviousCostData();
    if (previousCostData && previousCostData.monthlyProjection > 0) {
      const costIncrease = costData.monthlyProjection / previousCostData.monthlyProjection;
      
      if (costIncrease >= COST_SPIKE_THRESHOLD) {
        alerts.push({
          type: 'cost_spike',
          severity: 'critical',
          message: `Cost spike detected: ${(costIncrease * 100).toFixed(0)}% increase ($${previousCostData.monthlyProjection.toFixed(2)} → $${costData.monthlyProjection.toFixed(2)})`,
          category: 'total',
          currentValue: costData.monthlyProjection,
          threshold: previousCostData.monthlyProjection * COST_SPIKE_THRESHOLD,
          percentage: costIncrease * 100,
          timestamp: new Date(),
        });
      }
    }

    return alerts;
  }

  /**
   * Send cost alerts
   */
  async sendCostAlerts(alerts: CostAlert[]): Promise<void> {
    if (alerts.length === 0) {
      return;
    }

    const db = getDB();

    for (const alert of alerts) {
      try {
        // Check cooldown to prevent alert spam
        const lastAlert = await db.collection('cost_alerts').findOne(
          {
            type: alert.type,
            category: alert.category || 'total',
            timestamp: { $gte: new Date(Date.now() - this.alertCooldownMs) },
          },
          { sort: { timestamp: -1 } }
        );

        if (lastAlert) {
          logger.debug(
            { alertType: alert.type, category: alert.category },
            'Skipping alert - still in cooldown period'
          );
          continue;
        }

        // Store alert in database
        await db.collection('cost_alerts').insertOne({
          ...alert,
          costData: this.loadCostData(),
        });

        // Send via AlertingService (email/Slack)
        await this.sendAlertNotification(alert);

        // Send in-app notification to admin users
        await this.sendInAppNotification(alert);

        logger.info(
          {
            type: alert.type,
            severity: alert.severity,
            category: alert.category,
          },
          'Cost alert sent'
        );
      } catch (error) {
        logger.error({ error, alert }, 'Failed to send cost alert');
      }
    }
  }

  /**
   * Send alert via AlertingService (email/Slack)
   */
  private async sendAlertNotification(alert: CostAlert): Promise<void> {
    const title = `Cost Alert: ${alert.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
    
    await this.alertingService.sendGenericAlert({
      title,
      message: alert.message,
      severity: alert.severity,
      details: {
        type: alert.type,
        category: alert.category || 'total',
        currentValue: `$${alert.currentValue.toFixed(2)}`,
        threshold: `$${alert.threshold.toFixed(2)}`,
        percentage: `${alert.percentage.toFixed(1)}%`,
        timestamp: alert.timestamp.toISOString(),
      },
    });
  }

  /**
   * Send in-app notification to admin users
   */
  private async sendInAppNotification(alert: CostAlert): Promise<void> {
    try {
      const notificationService = getNotificationService();
      const db = getDB();

      // Get all admin users
      const adminUsers = await db
        .collection('users')
        .find({ role: 'admin' })
        .toArray();

      for (const user of adminUsers) {
        const userId = user._id?.toString() || user.user_id;
        if (!userId) continue;

        await notificationService.createSystemMaintenanceNotification(
          userId,
          `Cost Alert: ${alert.type.replace('_', ' ').toUpperCase()}`,
          alert.message
        );
      }
    } catch (error) {
      logger.error({ error, alert }, 'Failed to send in-app cost notification');
    }
  }

  /**
   * Run cost monitoring check and send alerts
   */
  async runCostMonitoring(): Promise<void> {
    logger.info('Running cost monitoring check...');

    const alerts = await this.checkCostAlerts();
    
    if (alerts.length > 0) {
      logger.warn({ alertCount: alerts.length }, 'Cost alerts detected');
      await this.sendCostAlerts(alerts);
    } else {
      logger.info('No cost alerts - within budget');
    }
  }

  /**
   * Get cost monitoring status
   */
  async getCostStatus(): Promise<{
    costData: CostData | null;
    budget: BudgetConfig;
    alerts: CostAlert[];
    status: 'within_budget' | 'approaching_budget' | 'exceeded_budget';
  }> {
    const costData = this.loadCostData();
    const alerts = await this.checkCostAlerts();

    let status: 'within_budget' | 'approaching_budget' | 'exceeded_budget' = 'within_budget';
    if (costData) {
      const totalUsed = (costData.monthlyProjection / this.budget.total) * 100;
      if (totalUsed >= 100) {
        status = 'exceeded_budget';
      } else if (totalUsed >= this.budget.thresholds.warning) {
        status = 'approaching_budget';
      }
    }

    return {
      costData,
      budget: this.budget,
      alerts,
      status,
    };
  }
}

// Singleton instance
let costMonitoringServiceInstance: CostMonitoringService | null = null;

/**
 * Get CostMonitoringService instance
 */
export function getCostMonitoringService(): CostMonitoringService {
  if (!costMonitoringServiceInstance) {
    costMonitoringServiceInstance = new CostMonitoringService();
  }
  return costMonitoringServiceInstance;
}

