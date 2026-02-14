/**
 * Email Configuration Types
 *
 * Defines what, when, and how email notifications are sent.
 */
export type EmailEventType = 'test_failure' | 'test_completion' | 'test_alert' | 'coverage_drop' | 'performance_regression' | 'flaky_test_detected' | 'test_suite_complete' | 'critical_failure';
export type EmailFrequency = 'immediate' | 'daily_digest' | 'weekly_summary' | 'hourly' | 'never';
export type EmailFormat = 'plain_text' | 'html' | 'html_template';
export interface EmailEventConfiguration {
    eventType: EmailEventType;
    enabled: boolean;
    frequency: EmailFrequency;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    conditions?: {
        minFailures?: number;
        testTypes?: string[];
        testSuites?: string[];
        excludePatterns?: string[];
    };
}
export interface EmailScheduleConfiguration {
    frequency: EmailFrequency;
    time?: string;
    dayOfWeek?: number;
    timezone?: string;
}
export interface EmailFormatConfiguration {
    format: EmailFormat;
    template?: string;
    includeDetails?: boolean;
    includeStackTrace?: boolean;
    includeMetrics?: boolean;
    maxItems?: number;
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
export declare const DEFAULT_EMAIL_EVENTS: EmailEventConfiguration[];
export declare const EVENT_TYPE_LABELS: Record<EmailEventType, string>;
export declare const FREQUENCY_LABELS: Record<EmailFrequency, string>;
export declare const FORMAT_LABELS: Record<EmailFormat, string>;
