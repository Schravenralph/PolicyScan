/**
 * Email Configuration Types
 * 
 * Defines what, when, and how email notifications are sent.
 */

export type EmailEventType =
  | 'test_failure'
  | 'test_completion'
  | 'test_alert'
  | 'coverage_drop'
  | 'performance_regression'
  | 'flaky_test_detected'
  | 'test_suite_complete'
  | 'critical_failure';

export type EmailFrequency =
  | 'immediate'      // Send immediately when event occurs
  | 'daily_digest'   // Daily summary at specified time
  | 'weekly_summary' // Weekly summary on specified day/time
  | 'hourly'         // Hourly digest
  | 'never';         // Never send (disabled)

export type EmailFormat =
  | 'plain_text'     // Plain text email
  | 'html'           // HTML formatted email
  | 'html_template'; // HTML with template styling

export interface EmailEventConfiguration {
  eventType: EmailEventType;
  enabled: boolean;
  frequency: EmailFrequency;
  severity?: 'low' | 'medium' | 'high' | 'critical'; // Minimum severity to trigger
  conditions?: {
    minFailures?: number;        // Only send if N or more failures
    testTypes?: string[];        // Only for specific test types
    testSuites?: string[];       // Only for specific test suites
    excludePatterns?: string[];  // Exclude tests matching these patterns
  };
}

export interface EmailScheduleConfiguration {
  frequency: EmailFrequency;
  time?: string;        // Time of day (HH:mm format, e.g., "09:00")
  dayOfWeek?: number;   // 0-6 (Sunday-Saturday) for weekly
  timezone?: string;    // Timezone (default: user's timezone)
}

export interface EmailFormatConfiguration {
  format: EmailFormat;
  template?: string;    // Template name if using html_template
  includeDetails?: boolean;  // Include detailed information
  includeStackTrace?: boolean; // Include stack traces
  includeMetrics?: boolean;    // Include test metrics
  maxItems?: number;    // Maximum items in digest
}

export interface EmailConfiguration {
  id?: string;
  recipients: string[];
  events: EmailEventConfiguration[];
  schedule: EmailScheduleConfiguration;
  format: EmailFormatConfiguration;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_EMAIL_EVENTS: EmailEventConfiguration[] = [
  {
    eventType: 'test_failure',
    enabled: true,
    frequency: 'immediate',
    severity: 'medium',
  },
  {
    eventType: 'critical_failure',
    enabled: true,
    frequency: 'immediate',
    severity: 'critical',
  },
  {
    eventType: 'test_completion',
    enabled: false,
    frequency: 'daily_digest',
  },
  {
    eventType: 'coverage_drop',
    enabled: true,
    frequency: 'daily_digest',
    severity: 'medium',
  },
  {
    eventType: 'performance_regression',
    enabled: true,
    frequency: 'daily_digest',
    severity: 'high',
  },
  {
    eventType: 'flaky_test_detected',
    enabled: true,
    frequency: 'daily_digest',
    severity: 'medium',
  },
];

export const EVENT_TYPE_LABELS: Record<EmailEventType, string> = {
  test_failure: 'Test Failures',
  test_completion: 'Test Completion',
  test_alert: 'Test Alerts',
  coverage_drop: 'Coverage Drops',
  performance_regression: 'Performance Regressions',
  flaky_test_detected: 'Flaky Tests Detected',
  test_suite_complete: 'Test Suite Complete',
  critical_failure: 'Critical Failures',
};

export const FREQUENCY_LABELS: Record<EmailFrequency, string> = {
  immediate: 'Immediate',
  daily_digest: 'Daily Digest',
  weekly_summary: 'Weekly Summary',
  hourly: 'Hourly Digest',
  never: 'Never',
};

export const FORMAT_LABELS: Record<EmailFormat, string> = {
  plain_text: 'Plain Text',
  html: 'HTML',
  html_template: 'HTML Template',
};

