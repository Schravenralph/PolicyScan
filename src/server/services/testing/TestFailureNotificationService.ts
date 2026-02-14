/**
 * Test Failure Notification Service
 * 
 * Comprehensive notification system for test failures, flaky tests, performance regressions,
 * and coverage drops. Supports email, Slack/Discord, and in-app notifications with user preferences.
 */

import { getNotificationService } from '../NotificationService.js';
import { getDB } from '../../config/database.js';
import { IUser } from '../../models/User.js';
import { logger } from '../../utils/logger.js';
import { TestHistory, TestHistoryDocument } from '../../models/TestHistory.js';
import { FlakeDetectionService } from './FlakeDetectionService.js';
import { PerformanceDriftService } from './PerformanceDriftService.js';
import { AlertingService } from '../monitoring/AlertingService.js';
import { getEmailService } from '../infrastructure/EmailService.js';
import { getWebhookService } from '../infrastructure/WebhookService.js';
import { getEmailNotificationService } from './EmailNotificationService.js';
import { getEmailDigestService } from './EmailDigestService.js';

export interface TestFailure {
    test: string;
    file: string;
    error: string;
}

export interface TestFailureNotificationData {
    testRunId: string;
    testFile: string | null;
    failureCount: number;
    totalTests: number;
    failures: TestFailure[];
    testResultUrl?: string;
}

export interface NotificationPreferences {
    userId: string;
    emailEnabled: boolean;
    slackEnabled: boolean;
    inAppEnabled: boolean;
    notificationTypes: {
        testFailureAfterPassing: boolean;
        flakyTest: boolean;
        performanceRegression: boolean;
        coverageDrop: boolean;
        generalFailure: boolean;
    };
    quietHours?: {
        enabled: boolean;
        start: string; // HH:mm format
        end: string; // HH:mm format
    };
}

export interface CoverageDropData {
    previousCoverage: {
        statements: number;
        branches: number;
        functions: number;
        lines: number;
    };
    currentCoverage: {
        statements: number;
        branches: number;
        functions: number;
        lines: number;
    };
    dropPercent: {
        statements: number;
        branches: number;
        functions: number;
        lines: number;
    };
    threshold: number; // Minimum drop percent to trigger notification
}

export class TestFailureNotificationService {
    private static instance: TestFailureNotificationService;
    private notificationService = getNotificationService();
    private alertingService = new AlertingService();
    private flakeDetectionService = FlakeDetectionService.getInstance();
    private performanceDriftService = PerformanceDriftService.getInstance();

    private constructor() {}

    static getInstance(): TestFailureNotificationService {
        if (!TestFailureNotificationService.instance) {
            TestFailureNotificationService.instance = new TestFailureNotificationService();
        }
        return TestFailureNotificationService.instance;
    }

    /**
     * Check if an email address is a test email (should not receive real notifications)
     */
    private isTestEmail(email: string): boolean {
        if (!email) return false;
        // Filter out test email patterns
        const testEmailPatterns = [
            /^user\d+@example\.com$/i,
            /^test.*@example\.com$/i,
            /@example\.com$/i, // Any @example.com address
        ];
        return testEmailPatterns.some(pattern => pattern.test(email));
    }

    /**
     * Get the configured recipient email for test failure notifications
     */
    private getNotificationRecipientEmail(): string | null {
        // Use environment variable if set, otherwise default to the user's email
        const recipientEmail = process.env.TEST_FAILURE_NOTIFICATION_EMAIL || process.env.ALERT_EMAIL_ADDRESSES?.split(',')[0]?.trim();
        if (recipientEmail && !this.isTestEmail(recipientEmail)) {
            return recipientEmail;
        }
        // Fallback to a known good email if available
        return 'ralphdrmoller@gmail.com';
    }

    /**
     * Send test failure notifications to all admin and developer users
     */
    async notifyTestFailures(data: TestFailureNotificationData): Promise<void> {
        try {
            const users = await this.getAdminAndDeveloperUsers();
            
            if (users.length === 0) {
                logger.warn('No admin or developer users found for test failure notifications');
                return;
            }

            // Check for failures after passing
            const failuresAfterPassing = await this.detectFailuresAfterPassing(data);
            
            // Only send emails for urgent failures (failures after passing)
            const isUrgent = failuresAfterPassing.length > 0;
            
            const userIds = users.map(u => u._id?.toString() || u.user_id);
            const preferencesMap = await this.getUsersPreferences(userIds);

            // Get the configured recipient email (filter out test emails)
            const recipientEmail = this.getNotificationRecipientEmail();

            // Send email notifications using EmailNotificationService
            // This respects user email configurations (what/when/how)
            const emailPromises: Promise<void>[] = [];
            const emailNotificationService = getEmailNotificationService();
            const emailDigestService = getEmailDigestService();

            for (const user of users) {
                const userId = user._id?.toString() || user.user_id;
                const severity = isUrgent ? 'critical' : 'high';

                // Check if immediate email should be sent
                const shouldSendImmediate = await emailNotificationService.shouldSendEmail(
                    userId,
                    'test_failure',
                    severity
                );

                if (shouldSendImmediate) {
                    emailPromises.push(
                        emailNotificationService.sendImmediateEmail(userId, {
                            eventType: 'test_failure',
                            severity,
                            testId: data.testRunId,
                            testName: data.testFile || 'Multiple tests',
                            error: data.failures[0]?.error,
                            runId: data.testRunId,
                            details: {
                                failureCount: data.failureCount,
                                totalTests: data.totalTests,
                                failures: data.failures.slice(0, 10),
                            },
                        }).catch(error => {
                            logger.error({ error, userId }, 'Failed to send immediate email notification');
                        })
                    );
                } else {
                    // Queue for digest if configured
                    await emailDigestService.queueEventForDigest(userId, {
                        userId,
                        eventType: 'test_failure',
                        severity,
                        data: {
                            eventType: 'test_failure',
                            severity,
                            testId: data.testRunId,
                            testName: data.testFile || 'Multiple tests',
                            error: data.failures[0]?.error,
                            runId: data.testRunId,
                            details: {
                                failureCount: data.failureCount,
                                totalTests: data.totalTests,
                                failures: data.failures.slice(0, 10),
                            },
                        },
                        timestamp: new Date(),
                    });
                }
            }

            const notificationPromises = users.map(async user => {
                const userId = user._id?.toString() || user.user_id;
                const preferences = preferencesMap.get(userId) || this.getDefaultPreferences(userId);
                
                // Check if user wants general failure notifications
                if (!preferences.notificationTypes.generalFailure) {
                    return;
                }

                // Check quiet hours
                if (this.isQuietHours(preferences)) {
                    logger.info({ userId: user._id }, 'Skipping notification due to quiet hours');
                    return;
                }

                // Send in-app notification
                if (preferences.inAppEnabled) {
                    await this.sendInAppNotification(
                        user._id?.toString() || user.user_id,
                        data,
                        failuresAfterPassing.length > 0
                    ).catch(error => {
                        logger.error({ userId: user._id, error }, 'Failed to send in-app notification');
                    });
                }

                // Send Slack/Discord notification
                if (preferences.slackEnabled) {
                    await this.sendSlackNotification(
                        data,
                        failuresAfterPassing.length > 0
                    ).catch(error => {
                        logger.error({ userId: user._id, error }, 'Failed to send Slack notification');
                    });
                }
            });

            // Execute all notifications including email
            await Promise.allSettled([...notificationPromises, ...emailPromises]);

            await Promise.allSettled(notificationPromises);
            
            logger.info(
                { 
                    testRunId: data.testRunId, 
                    failureCount: data.failureCount,
                    notifiedUsers: users.length,
                    failuresAfterPassing: failuresAfterPassing.length,
                    emailSent: isUrgent && recipientEmail ? true : false,
                    recipientEmail: isUrgent && recipientEmail ? recipientEmail : undefined
                },
                'Test failure notifications sent'
            );
        } catch (error) {
            logger.error(
                { error, testRunId: data.testRunId },
                'Failed to send test failure notifications'
            );
        }
    }

    /**
     * Detect test failures after passing (tests that were passing but now failing)
     */
    async detectFailuresAfterPassing(data: TestFailureNotificationData): Promise<TestFailure[]> {
        const failuresAfterPassing: TestFailure[] = [];

        for (const failure of data.failures) {
            // Find previous successful run of this test
            const previousRuns = await TestHistory.find({
                testFilePath: failure.file,
                limit: 10,
                sort: { executionTimestamp: -1 },
            });

            // Check if test was passing in recent runs
            const wasPassing = previousRuns.entries.some(run => {
                if (run.result.failed === 0) {
                    // Check if this specific test was in the passing run
                    const testName = failure.test;
                    // If no failures, assume all tests passed
                    return true;
                }
                return false;
            });

            if (wasPassing) {
                failuresAfterPassing.push(failure);
            }
        }

        return failuresAfterPassing;
    }

    /**
     * Notify about flaky test detection
     */
    async notifyFlakyTests(config?: {
        passRateThreshold?: number;
        timeWindowDays?: number;
    }): Promise<void> {
        try {
            const flakeResult = await this.flakeDetectionService.detectFlakes({
                passRateThreshold: config?.passRateThreshold || 0.95,
                timeWindowDays: config?.timeWindowDays || 30,
            });

            if (flakeResult.flaky_tests.length === 0) {
                return;
            }

            const users = await this.getAdminAndDeveloperUsers();
            const userIds = users.map(u => u._id?.toString() || u.user_id);
            const preferencesMap = await this.getUsersPreferences(userIds);

            for (const user of users) {
                const userId = user._id?.toString() || user.user_id;
                const preferences = preferencesMap.get(userId) || this.getDefaultPreferences(userId);
                
                if (!preferences.notificationTypes.flakyTest) {
                    continue;
                }

                if (this.isQuietHours(preferences)) {
                    continue;
                }

                // Send in-app notification
                if (preferences.inAppEnabled) {
                    await this.notificationService.createNotification({
                        user_id: user._id?.toString() || user.user_id,
                        type: 'test_flaky',
                        title: `⚠️ ${flakeResult.flaky_tests.length} Flaky Test${flakeResult.flaky_tests.length !== 1 ? 's' : ''} Detected`,
                        message: `Found ${flakeResult.flaky_tests.length} flaky test${flakeResult.flaky_tests.length !== 1 ? 's' : ''} with pass rate below ${(config?.passRateThreshold || 0.95) * 100}%`,
                        link: '/tests#flake-detection',
                        metadata: {
                            flakyCount: flakeResult.flaky_tests.length,
                            flakeRate: flakeResult.summary.flake_rate,
                        },
                    }).catch(error => {
                        logger.error({ userId: user._id, error }, 'Failed to send flaky test notification');
                    });
                }

                // Send email notifications using EmailNotificationService
                const emailNotificationService = getEmailNotificationService();
                const emailDigestService = getEmailDigestService();
                
                const shouldSendImmediate = await emailNotificationService.shouldSendEmail(
                    userId,
                    'flaky_test_detected',
                    'medium'
                );

                if (shouldSendImmediate) {
                    await emailNotificationService.sendImmediateEmail(userId, {
                        eventType: 'flaky_test_detected',
                        severity: 'medium',
                        testName: `${flakeResult.flaky_tests.length} flaky test${flakeResult.flaky_tests.length !== 1 ? 's' : ''}`,
                        details: {
                            flakyCount: flakeResult.flaky_tests.length,
                            flakeRate: flakeResult.summary.flake_rate,
                            flakyTests: flakeResult.flaky_tests.slice(0, 10),
                        },
                    }).catch(error => {
                        logger.error({ error, userId }, 'Failed to send immediate email for flaky tests');
                    });
                } else {
                    // Queue for digest
                    await emailDigestService.queueEventForDigest(userId, {
                        userId,
                        eventType: 'flaky_test_detected',
                        severity: 'medium',
                        data: {
                            eventType: 'flaky_test_detected',
                            severity: 'medium',
                            testName: `${flakeResult.flaky_tests.length} flaky test${flakeResult.flaky_tests.length !== 1 ? 's' : ''}`,
                            details: {
                                flakyCount: flakeResult.flaky_tests.length,
                                flakeRate: flakeResult.summary.flake_rate,
                                flakyTests: flakeResult.flaky_tests.slice(0, 10),
                            },
                        },
                        timestamp: new Date(),
                    });
                }

                // Send Slack if enabled
                if (preferences.slackEnabled) {
                    const message = `⚠️ Flaky Test Alert\n\nFound ${flakeResult.flaky_tests.length} flaky test${flakeResult.flaky_tests.length !== 1 ? 's' : ''}:\n\n${flakeResult.flaky_tests.slice(0, 5).map(t => `- ${t.test_id} (${(t.pass_rate * 100).toFixed(1)}% pass rate)`).join('\n')}${flakeResult.flaky_tests.length > 5 ? `\n... and ${flakeResult.flaky_tests.length - 5} more` : ''}`;
                    await this.sendSlackMessage(message, 'warning').catch(error => {
                        logger.error({ error }, 'Failed to send Slack flaky test alert');
                    });
                }
            }

            logger.info(
                { flakyCount: flakeResult.flaky_tests.length },
                'Flaky test notifications sent'
            );
        } catch (error) {
            logger.error({ error }, 'Failed to send flaky test notifications');
        }
    }

    /**
     * Notify about performance regressions
     */
    async notifyPerformanceRegressions(config?: {
        thresholdPercent?: number;
        baselineWindowDays?: number;
    }): Promise<void> {
        try {
            const driftReport = await this.performanceDriftService.analyzeDrift({
                threshold_percent: config?.thresholdPercent || 20,
                baseline_window_days: config?.baselineWindowDays || 30,
            });

            if (driftReport.regressions.length === 0) {
                return;
            }

            const users = await this.getAdminAndDeveloperUsers();
            const userIds = users.map(u => u._id?.toString() || u.user_id);
            const preferencesMap = await this.getUsersPreferences(userIds);

            for (const user of users) {
                const userId = user._id?.toString() || user.user_id;
                const preferences = preferencesMap.get(userId) || this.getDefaultPreferences(userId);
                
                if (!preferences.notificationTypes.performanceRegression) {
                    continue;
                }

                if (this.isQuietHours(preferences)) {
                    continue;
                }

                // Send in-app notification
                if (preferences.inAppEnabled) {
                    await this.notificationService.createNotification({
                        user_id: user._id?.toString() || user.user_id,
                        type: 'test_performance_regression',
                        title: `⚡ ${driftReport.regressions.length} Performance Regression${driftReport.regressions.length !== 1 ? 's' : ''} Detected`,
                        message: `Found ${driftReport.regressions.length} test${driftReport.regressions.length !== 1 ? 's' : ''} with significant performance degradation (>${config?.thresholdPercent || 20}% slower)`,
                        link: '/tests/performance#drift',
                        metadata: {
                            regressionCount: driftReport.regressions.length,
                            averageIncrease: driftReport.summary.average_increase_percent,
                        },
                    }).catch(error => {
                        logger.error({ userId: user._id, error }, 'Failed to send performance regression notification');
                    });
                }

                // Send email notifications using EmailNotificationService
                const emailNotificationService = getEmailNotificationService();
                const emailDigestService = getEmailDigestService();
                
                const shouldSendImmediate = await emailNotificationService.shouldSendEmail(
                    userId,
                    'performance_regression',
                    'high'
                );

                if (shouldSendImmediate) {
                    await emailNotificationService.sendImmediateEmail(userId, {
                        eventType: 'performance_regression',
                        severity: 'high',
                        testName: `${driftReport.regressions.length} performance regression${driftReport.regressions.length !== 1 ? 's' : ''}`,
                        details: {
                            regressionCount: driftReport.regressions.length,
                            averageIncrease: driftReport.summary.average_increase_percent,
                            regressions: driftReport.regressions.slice(0, 10),
                        },
                    }).catch(error => {
                        logger.error({ error, userId }, 'Failed to send immediate email for performance regressions');
                    });
                } else {
                    // Queue for digest
                    await emailDigestService.queueEventForDigest(userId, {
                        userId,
                        eventType: 'performance_regression',
                        severity: 'high',
                        data: {
                            eventType: 'performance_regression',
                            severity: 'high',
                            testName: `${driftReport.regressions.length} performance regression${driftReport.regressions.length !== 1 ? 's' : ''}`,
                            details: {
                                regressionCount: driftReport.regressions.length,
                                averageIncrease: driftReport.summary.average_increase_percent,
                                regressions: driftReport.regressions.slice(0, 10),
                            },
                        },
                        timestamp: new Date(),
                    });
                }

                // Send Slack if enabled
                if (preferences.slackEnabled) {
                    const message = `⚡ Performance Regression Alert\n\nFound ${driftReport.regressions.length} test${driftReport.regressions.length !== 1 ? 's' : ''} with performance degradation:\n\n${driftReport.regressions.slice(0, 5).map(r => `- ${r.test_id || 'unknown'}: ${r.increase_percent.toFixed(1)}% slower (${r.current_duration}ms vs ${r.baseline_duration}ms)`).join('\n')}${driftReport.regressions.length > 5 ? `\n... and ${driftReport.regressions.length - 5} more` : ''}`;
                    await this.sendSlackMessage(message, 'warning').catch(error => {
                        logger.error({ error }, 'Failed to send Slack performance regression alert');
                    });
                }
            }

            logger.info(
                { regressionCount: driftReport.regressions.length },
                'Performance regression notifications sent'
            );
        } catch (error) {
            logger.error({ error }, 'Failed to send performance regression notifications');
        }
    }

    /**
     * Notify about coverage drops
     */
    async notifyCoverageDrop(coverageData: CoverageDropData): Promise<void> {
        try {
            // Check if drop exceeds threshold
            const significantDrop = 
                coverageData.dropPercent.statements > coverageData.threshold ||
                coverageData.dropPercent.branches > coverageData.threshold ||
                coverageData.dropPercent.functions > coverageData.threshold ||
                coverageData.dropPercent.lines > coverageData.threshold;

            if (!significantDrop) {
                return;
            }

            const users = await this.getAdminAndDeveloperUsers();
            const userIds = users.map(u => u._id?.toString() || u.user_id);
            const preferencesMap = await this.getUsersPreferences(userIds);

            for (const user of users) {
                const userId = user._id?.toString() || user.user_id;
                const preferences = preferencesMap.get(userId) || this.getDefaultPreferences(userId);
                
                if (!preferences.notificationTypes.coverageDrop) {
                    continue;
                }

                if (this.isQuietHours(preferences)) {
                    continue;
                }

                // Send in-app notification
                if (preferences.inAppEnabled) {
                    await this.notificationService.createNotification({
                        user_id: user._id?.toString() || user.user_id,
                        type: 'test_coverage_drop',
                        title: '📉 Test Coverage Drop Detected',
                        message: `Coverage dropped: Statements ${coverageData.dropPercent.statements.toFixed(1)}%, Branches ${coverageData.dropPercent.branches.toFixed(1)}%, Functions ${coverageData.dropPercent.functions.toFixed(1)}%, Lines ${coverageData.dropPercent.lines.toFixed(1)}%`,
                        link: '/tests/coverage',
                        metadata: {
                            previousCoverage: coverageData.previousCoverage,
                            currentCoverage: coverageData.currentCoverage,
                            dropPercent: coverageData.dropPercent,
                        },
                    }).catch(error => {
                        logger.error({ userId: user._id, error }, 'Failed to send coverage drop notification');
                    });
                }

                // Send email notifications using EmailNotificationService
                const emailNotificationService = getEmailNotificationService();
                const emailDigestService = getEmailDigestService();
                
                const shouldSendImmediate = await emailNotificationService.shouldSendEmail(
                    userId,
                    'coverage_drop',
                    'medium'
                );

                if (shouldSendImmediate) {
                    await emailNotificationService.sendImmediateEmail(userId, {
                        eventType: 'coverage_drop',
                        severity: 'medium',
                        testName: 'Coverage Drop Detected',
                        details: {
                            previousCoverage: coverageData.previousCoverage,
                            currentCoverage: coverageData.currentCoverage,
                            dropPercent: coverageData.dropPercent,
                        },
                    }).catch(error => {
                        logger.error({ error, userId }, 'Failed to send immediate email for coverage drop');
                    });
                } else {
                    // Queue for digest
                    await emailDigestService.queueEventForDigest(userId, {
                        userId,
                        eventType: 'coverage_drop',
                        severity: 'medium',
                        data: {
                            eventType: 'coverage_drop',
                            severity: 'medium',
                            testName: 'Coverage Drop Detected',
                            details: {
                                previousCoverage: coverageData.previousCoverage,
                                currentCoverage: coverageData.currentCoverage,
                                dropPercent: coverageData.dropPercent,
                            },
                        },
                        timestamp: new Date(),
                    });
                }

                // Send Slack if enabled
                if (preferences.slackEnabled) {
                    const message = `📉 Coverage Drop Alert\n\nTest coverage has dropped:\n- Statements: ${coverageData.previousCoverage.statements.toFixed(1)}% → ${coverageData.currentCoverage.statements.toFixed(1)}% (${coverageData.dropPercent.statements > 0 ? '-' : '+'}${coverageData.dropPercent.statements.toFixed(1)}%)\n- Branches: ${coverageData.previousCoverage.branches.toFixed(1)}% → ${coverageData.currentCoverage.branches.toFixed(1)}% (${coverageData.dropPercent.branches > 0 ? '-' : '+'}${coverageData.dropPercent.branches.toFixed(1)}%)\n- Functions: ${coverageData.previousCoverage.functions.toFixed(1)}% → ${coverageData.currentCoverage.functions.toFixed(1)}% (${coverageData.dropPercent.functions > 0 ? '-' : '+'}${coverageData.dropPercent.functions.toFixed(1)}%)\n- Lines: ${coverageData.previousCoverage.lines.toFixed(1)}% → ${coverageData.currentCoverage.lines.toFixed(1)}% (${coverageData.dropPercent.lines > 0 ? '-' : '+'}${coverageData.dropPercent.lines.toFixed(1)}%)`;
                    await this.sendSlackMessage(message, 'warning').catch(error => {
                        logger.error({ error }, 'Failed to send Slack coverage drop alert');
                    });
                }
            }

            logger.info(
                { dropPercent: coverageData.dropPercent },
                'Coverage drop notifications sent'
            );
        } catch (error) {
            logger.error({ error }, 'Failed to send coverage drop notifications');
        }
    }

    /**
     * Send in-app notification
     */
    private async sendInAppNotification(
        userId: string,
        data: TestFailureNotificationData,
        hasFailuresAfterPassing: boolean
    ): Promise<void> {
        const title = hasFailuresAfterPassing
            ? `⚠️ Test Failure After Passing: ${data.failureCount} failure${data.failureCount !== 1 ? 's' : ''}`
            : `❌ Test Failure: ${data.failureCount} failure${data.failureCount !== 1 ? 's' : ''}`;

        const message = hasFailuresAfterPassing
            ? `${data.failureCount} test${data.failureCount !== 1 ? 's' : ''} that were previously passing have now failed.`
            : `${data.failureCount} of ${data.totalTests} test${data.totalTests !== 1 ? 's' : ''} failed.`;

        await this.notificationService.createTestFailureNotification(
            userId,
            data.testRunId,
            data.testFile,
            data.failureCount,
            data.totalTests,
            data.failures,
            data.testResultUrl
        );
    }

    /**
     * Send email notification
     */
    private async sendEmailNotification(
        user: { _id?: unknown; user_id: string; email: string },
        data: TestFailureNotificationData,
        hasFailuresAfterPassing: boolean
    ): Promise<void> {
        const emailService = getEmailService();

        const emailSubject = hasFailuresAfterPassing
            ? `[Beleidsscan] ⚠️ Test Failure After Passing: ${data.failureCount} failure${data.failureCount !== 1 ? 's' : ''}`
            : `[Beleidsscan] ❌ Test Failure: ${data.failureCount} failure${data.failureCount !== 1 ? 's' : ''}`;

        const emailBody = `
Test Failure Notification

${hasFailuresAfterPassing ? '⚠️ WARNING: Tests that were previously passing have now failed.\n\n' : ''}
Test Run ID: ${data.testRunId}
Test File: ${data.testFile || 'Multiple files'}
Failures: ${data.failureCount} of ${data.totalTests} tests

Failed Tests:
${data.failures.slice(0, 10).map(f => `- ${f.test} (${f.file}): ${f.error.substring(0, 200)}`).join('\n')}
${data.failures.length > 10 ? `... and ${data.failures.length - 10} more failures` : ''}

${data.testResultUrl ? `View results: ${data.testResultUrl}` : ''}
        `.trim();

        const html = this.formatEmailHtml(data, hasFailuresAfterPassing);

        await emailService.send({
            to: user.email,
            subject: emailSubject,
            text: emailBody,
            html,
        });
    }

    private formatEmailHtml(data: TestFailureNotificationData, hasFailuresAfterPassing: boolean): string {
        const title = hasFailuresAfterPassing
            ? `⚠️ Test Failure After Passing`
            : `❌ Test Failure`;
        const color = hasFailuresAfterPassing ? '#ff9900' : '#ff0000';

        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: ${color}; color: white; padding: 10px; border-radius: 5px 5px 0 0;">
                    <h2 style="margin: 0;">${title}</h2>
                </div>
                <div style="border: 1px solid #ddd; padding: 15px; border-radius: 0 0 5px 5px;">
                    <p><strong>Test Run ID:</strong> ${data.testRunId}</p>
                    <p><strong>Test File:</strong> ${data.testFile || 'Multiple files'}</p>
                    <p><strong>Failures:</strong> ${data.failureCount} of ${data.totalTests} tests</p>

                    <h3>Failed Tests</h3>
                    <ul style="background-color: #f5f5f5; padding: 10px; border-radius: 5px;">
                        ${data.failures.slice(0, 10).map(f => `
                            <li style="margin-bottom: 10px;">
                                <strong>${f.test}</strong><br>
                                <span style="color: #666; font-size: 12px;">${f.file}</span><br>
                                <pre style="color: #c00; white-space: pre-wrap; margin: 5px 0 0 0; font-size: 11px;">${f.error.substring(0, 300)}</pre>
                            </li>
                        `).join('')}
                    </ul>
                    ${data.failures.length > 10 ? `<p>... and ${data.failures.length - 10} more failures</p>` : ''}

                    ${data.testResultUrl ? `<p><a href="${data.testResultUrl}" style="background-color: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Results</a></p>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Send Slack notification
     */
    private async sendSlackNotification(
        data: TestFailureNotificationData,
        hasFailuresAfterPassing: boolean
    ): Promise<void> {
        const title = hasFailuresAfterPassing
            ? `⚠️ Test Failure After Passing: ${data.failureCount} failure${data.failureCount !== 1 ? 's' : ''}`
            : `❌ Test Failure: ${data.failureCount} failure${data.failureCount !== 1 ? 's' : ''}`;

        const message = `${title}\n\nTest Run: ${data.testRunId}\nTest File: ${data.testFile || 'Multiple files'}\nFailures: ${data.failureCount} of ${data.totalTests} tests\n\n${data.failures.slice(0, 5).map(f => `• ${f.test}: ${f.error.substring(0, 100)}`).join('\n')}${data.failures.length > 5 ? `\n... and ${data.failures.length - 5} more` : ''}`;

        await this.sendSlackMessage(message, hasFailuresAfterPassing ? 'warning' : 'error');
    }

    /**
     * Send Slack message via webhook
     */
    private async sendSlackMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
        const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
        
        if (!slackWebhookUrl) {
            logger.warn('Slack/Discord webhook URL not configured');
            return;
        }

        const colors = {
            info: '#36a64f',
            warning: '#ff9900',
            error: '#ff0000',
        };

        const payload = {
            text: message,
            attachments: [
                {
                    color: colors[level],
                    text: message,
                    footer: 'Beleidsscan Test Notifications',
                    ts: Math.floor(Date.now() / 1000),
                },
            ],
        };

        const webhookService = getWebhookService();
        const result = await webhookService.sendWebhook({
            url: slackWebhookUrl,
            payload,
            timeoutMs: 10000, // 10 seconds
            maxRetries: 3,
        });

        if (!result.success) {
            logger.error(
                { 
                    error: result.error, 
                    attemptCount: result.attemptCount,
                    statusCode: result.statusCode 
                },
                'Failed to send Slack message after retries'
            );
        }
    }

    /**
     * Get all admin and developer users (excluding test users)
     */
    private async getAdminAndDeveloperUsers(): Promise<Array<{ _id?: unknown; user_id: string; email: string }>> {
        try {
            const db = getDB();
            const users = await db.collection<IUser>('users')
                .find({ role: { $in: ['admin', 'developer'] } })
                .toArray();
            
            // Filter out test email addresses
            return users
                .filter(user => !this.isTestEmail(user.email))
                .map(user => ({
                    _id: user._id,
                    user_id: user._id?.toString() || '',
                    email: user.email,
                }));
        } catch (error) {
            logger.error({ error }, 'Failed to fetch admin and developer users');
            return [];
        }
    }

    /**
     * Get default notification preferences
     */
    private getDefaultPreferences(userId: string): NotificationPreferences {
        return {
            userId,
            emailEnabled: false,
            slackEnabled: false,
            inAppEnabled: true,
            notificationTypes: {
                testFailureAfterPassing: true,
                flakyTest: true,
                performanceRegression: true,
                coverageDrop: true,
                generalFailure: true,
            },
        };
    }

    /**
     * Get user notification preferences (with defaults)
     */
    async getUserPreferences(userId: string): Promise<NotificationPreferences> {
        try {
            const db = getDB();
            const prefs = await db.collection<NotificationPreferences>('notification_preferences')
                .findOne({ userId });

            if (prefs) {
                return prefs;
            }

            // Return default preferences
            return this.getDefaultPreferences(userId);
        } catch (error) {
            logger.error({ error, userId }, 'Failed to fetch user notification preferences');
            // Return defaults on error
            return this.getDefaultPreferences(userId);
        }
    }

    /**
     * Get notification preferences for multiple users (bulk fetch)
     */
    async getUsersPreferences(userIds: string[]): Promise<Map<string, NotificationPreferences>> {
        try {
            const db = getDB();
            const prefs = await db.collection<NotificationPreferences>('notification_preferences')
                .find({ userId: { $in: userIds } })
                .toArray();

            const prefsMap = new Map<string, NotificationPreferences>();
            prefs.forEach(p => prefsMap.set(p.userId, p));

            return prefsMap;
        } catch (error) {
            logger.error({ error, userIdsCount: userIds.length }, 'Failed to fetch users notification preferences');
            return new Map();
        }
    }

    /**
     * Save user notification preferences
     */
    async saveUserPreferences(preferences: NotificationPreferences): Promise<void> {
        try {
            const db = getDB();
            await db.collection<NotificationPreferences>('notification_preferences')
                .updateOne(
                    { userId: preferences.userId },
                    { $set: preferences },
                    { upsert: true }
                );
        } catch (error) {
            logger.error({ error, userId: preferences.userId }, 'Failed to save user notification preferences');
            throw error;
        }
    }

    /**
     * Check if current time is within quiet hours
     */
    private isQuietHours(preferences: NotificationPreferences): boolean {
        if (!preferences.quietHours?.enabled) {
            return false;
        }

        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const { start, end } = preferences.quietHours;

        // Handle quiet hours that span midnight
        if (start > end) {
            return currentTime >= start || currentTime <= end;
        }

        return currentTime >= start && currentTime <= end;
    }

    /**
     * Check if test failures should trigger notifications
     */
    shouldNotify(failureCount: number, totalTests: number): boolean {
        if (failureCount === 0) {
            return false;
        }

        const failureRate = failureCount / totalTests;
        return failureRate > 0.1 || failureCount >= 2;
    }
}

export const getTestFailureNotificationService = () => TestFailureNotificationService.getInstance();
