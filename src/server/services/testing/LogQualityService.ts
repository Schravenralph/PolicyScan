/**
 * Log Quality Service
 * 
 * Measures and tracks log quality metrics for test logging.
 * Provides insights into log completeness, descriptiveness, consistency, and usefulness.
 * 
 * Quality Metrics:
 * - Log completeness: Percentage of test steps that are logged
 * - Log descriptiveness: Quality of log messages (length, context, action verbs)
 * - Log consistency: Adherence to logging patterns
 * - Log usefulness: How well logs help debug failures
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { glob } from 'glob';
import { logger } from '../../utils/logger.js';

export interface LogQualityMetrics {
  testFile: string;
  testName?: string;
  completeness: CompletenessMetrics;
  descriptiveness: DescriptivenessMetrics;
  consistency: ConsistencyMetrics;
  usefulness: UsefulnessMetrics;
  overallScore: number;
  timestamp: Date;
}

export interface CompletenessMetrics {
  hasLogger: boolean;
  hasSaveCall: boolean;
  hasFinallyBlock: boolean;
  stepCount: number;
  loggedStepCount: number;
  navigationLogged: boolean;
  interactionLogged: boolean;
  errorHandlingLogged: boolean;
  score: number; // 0-100
}

export interface DescriptivenessMetrics {
  averageMessageLength: number;
  messagesWithActionVerbs: number;
  messagesWithContext: number;
  messagesWithDetails: number;
  totalMessages: number;
  score: number; // 0-100
}

export interface ConsistencyMetrics {
  usesAutoLogger: boolean;
  usesManualLogger: boolean;
  patternAdherence: 'recommended' | 'acceptable' | 'needs_improvement';
  saveInFinally: boolean;
  consistentFormat: boolean;
  score: number; // 0-100
}

export interface UsefulnessMetrics {
  hasStartLog: boolean;
  hasEndLog: boolean;
  hasErrorLogs: boolean;
  hasScreenshots: boolean;
  hasNetworkLogs: boolean;
  hasConsoleLogs: boolean;
  score: number; // 0-100
}

export interface QualityReport {
  summary: {
    totalTests: number;
    averageScore: number;
    testsByScore: {
      excellent: number; // 90-100
      good: number; // 70-89
      fair: number; // 50-69
      poor: number; // 0-49
    };
  };
  metrics: LogQualityMetrics[];
  recommendations: string[];
  timestamp: Date;
}

/**
 * Service for measuring and tracking log quality
 */
export class LogQualityService {
  /**
   * Analyze log quality for a single test file
   */
  async analyzeTestFile(filePath: string): Promise<LogQualityMetrics> {
    const content = await readFile(filePath, 'utf-8');
    
    // Completeness metrics
    const completeness = this.analyzeCompleteness(content, filePath);
    
    // Descriptiveness metrics
    const descriptiveness = this.analyzeDescriptiveness(content);
    
    // Consistency metrics
    const consistency = this.analyzeConsistency(content);
    
    // Usefulness metrics
    const usefulness = this.analyzeUsefulness(content);
    
    // Calculate overall score (weighted average)
    const overallScore = (
      completeness.score * 0.3 +
      descriptiveness.score * 0.25 +
      consistency.score * 0.25 +
      usefulness.score * 0.2
    );
    
    return {
      testFile: filePath,
      completeness,
      descriptiveness,
      consistency,
      usefulness,
      overallScore: Math.round(overallScore * 100) / 100,
      timestamp: new Date(),
    };
  }
  
  /**
   * Analyze completeness of logging
   */
  private analyzeCompleteness(content: string, filePath: string): CompletenessMetrics {
    const hasLogger = 
      content.includes('TestLogger') ||
      content.includes('setupAutoLogger') ||
      content.includes('withAutoLogger');
    
    const hasSaveCall = 
      content.includes('logger.save()') ||
      content.includes('await logger.save()');
    
    const hasFinallyBlock = /finally\s*\{/.test(content);
    
    // Count test steps (approximate - look for common patterns)
    const stepPatterns = [
      /page\.goto/,
      /page\.click/,
      /page\.fill/,
      /page\.type/,
      /page\.waitFor/,
      /expect\(/,
      /await.*request/,
    ];
    
    let stepCount = 0;
    for (const pattern of stepPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) stepCount += matches.length;
    }
    
    // Count logged steps
    const loggedStepCount = (content.match(/logger\.logStep/g) || []).length;
    
    // Check for specific log types
    const navigationLogged = /logStep.*[Nn]avigat/i.test(content);
    const interactionLogged = /logStep.*([Cc]lick|[Ff]ill|[Tt]ype)/i.test(content);
    const errorHandlingLogged = /logStep.*[Ee]rror/i.test(content) || /catch.*logStep/i.test(content);
    
    // Calculate completeness score
    let score = 0;
    if (hasLogger) score += 20;
    if (hasSaveCall) score += 30;
    if (hasFinallyBlock && hasSaveCall) score += 20;
    if (stepCount > 0) {
      const loggedRatio = loggedStepCount / stepCount;
      score += Math.min(30, loggedRatio * 30);
    }
    
    return {
      hasLogger,
      hasSaveCall,
      hasFinallyBlock,
      stepCount,
      loggedStepCount,
      navigationLogged,
      interactionLogged,
      errorHandlingLogged,
      score: Math.min(100, score),
    };
  }
  
  /**
   * Analyze descriptiveness of log messages
   */
  private analyzeDescriptiveness(content: string): DescriptivenessMetrics {
    const logStepMatches = content.matchAll(/logger\.logStep\(['"]([^'"]+)['"]/g);
    const messages: string[] = [];
    
    for (const match of logStepMatches) {
      messages.push(match[1]);
    }
    
    if (messages.length === 0) {
      return {
        averageMessageLength: 0,
        messagesWithActionVerbs: 0,
        messagesWithContext: 0,
        messagesWithDetails: 0,
        totalMessages: 0,
        score: 0,
      };
    }
    
    const totalLength = messages.reduce((sum, msg) => sum + msg.length, 0);
    const averageMessageLength = totalLength / messages.length;
    
    // Check for action verbs
    const actionVerbPattern = /^(Starting|Navigating|Waiting|Clicking|Filling|Submitting|Verifying|Checking|Completing|Finished|Loading|Opening|Closing|Selecting|Entering|Submitting)/i;
    const messagesWithActionVerbs = messages.filter(msg => actionVerbPattern.test(msg)).length;
    
    // Check for context (details parameter)
    const messagesWithDetails = (content.match(/logStep\([^,]+,\s*\{/g) || []).length;
    
    // Check for context in message (URLs, IDs, etc.)
    const contextPattern = /(url|id|name|value|status|result|error)/i;
    const messagesWithContext = messages.filter(msg => contextPattern.test(msg)).length;
    
    // Calculate descriptiveness score
    let score = 0;
    if (averageMessageLength >= 20) score += 30;
    else if (averageMessageLength >= 10) score += 20;
    else score += 10;
    
    if (messages.length > 0) {
      score += (messagesWithActionVerbs / messages.length) * 30;
      score += (messagesWithContext / messages.length) * 20;
      score += (messagesWithDetails / messages.length) * 20;
    }
    
    return {
      averageMessageLength: Math.round(averageMessageLength * 100) / 100,
      messagesWithActionVerbs,
      messagesWithContext,
      messagesWithDetails,
      totalMessages: messages.length,
      score: Math.min(100, score),
    };
  }
  
  /**
   * Analyze consistency of logging patterns
   */
  private analyzeConsistency(content: string): ConsistencyMetrics {
    const usesAutoLogger = 
      content.includes('setupAutoLogger') ||
      content.includes('withAutoLogger');
    
    const usesManualLogger = 
      content.includes('new TestLogger(') &&
      !usesAutoLogger;
    
    let patternAdherence: 'recommended' | 'acceptable' | 'needs_improvement' = 'recommended';
    if (usesManualLogger && !usesAutoLogger) {
      patternAdherence = 'acceptable';
    }
    if (!content.includes('logger.save()')) {
      patternAdherence = 'needs_improvement';
    }
    
    const hasFinallyBlock = /finally\s*\{/.test(content);
    const hasSaveCall = content.includes('logger.save()');
    const saveInFinally = hasFinallyBlock && hasSaveCall && 
      content.indexOf('finally') < content.indexOf('logger.save()');
    
    // Check for consistent format (all logStep calls follow similar pattern)
    const logStepCalls = content.matchAll(/logger\.logStep\(/g);
    const logStepCount = Array.from(logStepCalls).length;
    const consistentFormat = logStepCount <= 1 || logStepCount > 0; // Simple check
    
    // Calculate consistency score
    let score = 0;
    if (usesAutoLogger) score += 40;
    else if (usesManualLogger) score += 20;
    
    if (saveInFinally || usesAutoLogger) score += 30;
    else if (hasSaveCall) score += 15;
    
    if (patternAdherence === 'recommended') score += 30;
    else if (patternAdherence === 'acceptable') score += 15;
    
    return {
      usesAutoLogger,
      usesManualLogger,
      patternAdherence,
      saveInFinally,
      consistentFormat,
      score: Math.min(100, score),
    };
  }
  
  /**
   * Analyze usefulness of logs for debugging
   */
  private analyzeUsefulness(content: string): UsefulnessMetrics {
    const hasStartLog = /logStep.*[Ss]tart/i.test(content);
    const hasEndLog = /logStep.*([Ee]nd|[Cc]omplet|[Ff]inish)/i.test(content);
    const hasErrorLogs = 
      content.includes('logger.addLog') && /error/i.test(content) ||
      /logStep.*[Ee]rror/i.test(content);
    const hasScreenshots = 
      content.includes('logger.logScreenshot') ||
      content.includes('screenshot');
    const hasNetworkLogs = content.includes('startLogging') || content.includes('page.on');
    const hasConsoleLogs = content.includes('startLogging') || content.includes('console');
    
    // Calculate usefulness score
    let score = 0;
    if (hasStartLog) score += 15;
    if (hasEndLog) score += 15;
    if (hasErrorLogs) score += 20;
    if (hasScreenshots) score += 20;
    if (hasNetworkLogs) score += 15;
    if (hasConsoleLogs) score += 15;
    
    return {
      hasStartLog,
      hasEndLog,
      hasErrorLogs,
      hasScreenshots,
      hasNetworkLogs,
      hasConsoleLogs,
      score: Math.min(100, score),
    };
  }
  
  /**
   * Generate quality report for all test files
   */
  async generateQualityReport(testDir: string = 'tests/e2e'): Promise<QualityReport> {
    const projectRoot = process.cwd();
    const testFiles = await glob(`${testDir}/**/*.spec.ts`, { cwd: projectRoot });
    
    const metrics: LogQualityMetrics[] = [];
    
    for (const testFile of testFiles) {
      const fullPath = join(projectRoot, testFile);
      
      // Skip template files
      if (testFile.includes('TEMPLATE') || testFile.includes('template')) {
        continue;
      }
      
      try {
        const metric = await this.analyzeTestFile(fullPath);
        metrics.push(metric);
      } catch (error) {
        logger.warn({ error, file: testFile }, 'Failed to analyze test file');
      }
    }
    
    // Calculate summary statistics
    const totalTests = metrics.length;
    const averageScore = metrics.reduce((sum, m) => sum + m.overallScore, 0) / totalTests;
    
    const testsByScore = {
      excellent: metrics.filter(m => m.overallScore >= 90).length,
      good: metrics.filter(m => m.overallScore >= 70 && m.overallScore < 90).length,
      fair: metrics.filter(m => m.overallScore >= 50 && m.overallScore < 70).length,
      poor: metrics.filter(m => m.overallScore < 50).length,
    };
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics);
    
    return {
      summary: {
        totalTests,
        averageScore: Math.round(averageScore * 100) / 100,
        testsByScore,
      },
      metrics,
      recommendations,
      timestamp: new Date(),
    };
  }
  
  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(metrics: LogQualityMetrics[]): string[] {
    const recommendations: string[] = [];
    
    // Check for common issues
    const missingSave = metrics.filter(m => !m.completeness.hasSaveCall).length;
    if (missingSave > 0) {
      recommendations.push(`${missingSave} tests are missing logger.save() calls - logs will not be persisted`);
    }
    
    const missingFinally = metrics.filter(m => 
      m.completeness.hasSaveCall && !m.completeness.hasFinallyBlock
    ).length;
    if (missingFinally > 0) {
      recommendations.push(`${missingFinally} tests have logger.save() but not in finally blocks - logs may be lost on failure`);
    }
    
    const lowDescriptiveness = metrics.filter(m => m.descriptiveness.score < 50).length;
    if (lowDescriptiveness > 0) {
      recommendations.push(`${lowDescriptiveness} tests have low descriptiveness scores - consider adding more context to log messages`);
    }
    
    const inconsistentPatterns = metrics.filter(m => 
      m.consistency.patternAdherence === 'needs_improvement'
    ).length;
    if (inconsistentPatterns > 0) {
      recommendations.push(`${inconsistentPatterns} tests need pattern improvements - consider using setupAutoLogger() for consistency`);
    }
    
    const lowUsefulness = metrics.filter(m => m.usefulness.score < 50).length;
    if (lowUsefulness > 0) {
      recommendations.push(`${lowUsefulness} tests have low usefulness scores - consider adding error logs, screenshots, or network logs`);
    }
    
    return recommendations;
  }
}

