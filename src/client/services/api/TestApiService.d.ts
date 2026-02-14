import { BaseApiService } from './BaseApiService';
export interface TestRunResults {
    timestamp?: string;
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
    duration?: number;
    failures?: Array<{
        test: string;
        file: string;
        error: string;
        stackTrace?: string;
    }>;
}
export interface TestRunSummary {
    passRate?: number;
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
}
export interface TestRun {
    id?: string;
    runId?: string;
    timestamp?: string;
    executionTimestamp?: string;
    testFile?: string;
    testName?: string;
    suite?: string;
    status?: string;
    testType?: string;
    results?: TestRunResults;
    summary?: TestRunSummary;
    git?: {
        branch?: string;
        commit?: string;
    };
    [key: string]: unknown;
}
export interface DashboardData {
    lastUpdated?: string;
    totalRuns: number;
    recentRuns: TestRun[];
    pagination?: {
        limit: number;
        offset: number;
        total: number;
        hasMore: boolean;
    };
    summary?: {
        flakyTests?: string[];
        totalTests?: number;
        totalPassed?: number;
        totalFailed?: number;
        totalSkipped?: number;
        passRate?: number;
        [key: string]: unknown;
    };
    mongodbSummary?: {
        totalRuns?: number;
        totalPassed?: number;
        totalFailed?: number;
        totalSkipped?: number;
        totalTests?: number;
        passRate?: number;
        byTestType?: Record<string, unknown>;
        timeRangeDays?: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface TestStatus {
    running: boolean;
    startTime?: string;
    processId?: number;
    error?: string;
    testFile?: string;
    output?: string[];
    lastRunId?: string;
    filesReady?: boolean;
    progress?: {
        percentage: number;
        completed: number;
        total: number;
        estimatedTimeRemaining?: number;
    };
}
export interface TestOutputEntry {
    index: number;
    timestamp: string;
    type: 'info' | 'success' | 'error' | 'warning' | 'running' | 'step';
    message: string;
    details?: string;
}
export interface TestOutputResponse {
    running: boolean;
    startTime?: string;
    testFile?: string;
    totalLines: number;
    since: number;
    newLines: number;
    output: string;
    entries: TestOutputEntry[];
    structuredLogs?: Array<Record<string, unknown>>;
    testRunId?: string;
}
export interface ScheduledExport {
    id: string;
    name: string;
    schedule: string;
    format: 'csv' | 'json' | 'xlsx' | 'pdf';
    filters?: {
        testType?: string;
        branch?: string;
        timeRangeDays?: number;
    };
    recipients?: string[];
    enabled: boolean;
    lastRun?: string;
    nextRun?: string;
    createdAt: string;
    updatedAt: string;
}
export interface ScheduledExportConfig {
    name: string;
    schedule: string;
    format: 'csv' | 'json' | 'xlsx' | 'pdf';
    filters?: {
        testType?: string;
        branch?: string;
        timeRangeDays?: number;
    };
    recipients?: string[];
    enabled?: boolean;
}
export interface ActiveFailure {
    _id?: string;
    testId: string;
    testFilePath: string;
    testName: string;
    suite: string;
    firstSeenAt: string;
    lastSeenAt: string;
    seenCount: number;
    consecutiveFailures: number;
    severity?: string;
    isFlaky?: boolean;
    state?: string;
    resolvedAt?: string | null;
    failureFingerprint?: string;
}
export interface ActiveFailuresResponse {
    failures: ActiveFailure[];
    total: number;
    limit?: number;
    skip?: number;
}
export interface QueuedCommand {
    id: string;
    type: 'script' | 'pnpm';
    commandType: string;
    scriptPath?: string;
    args?: string[];
    commandString?: string;
    status: 'queued' | 'running';
    timestamp: number;
    originalCommand?: string;
}
export declare class TestApiService extends BaseApiService {
    private buildQuery;
    getDashboardData(limit?: number, offset?: number): Promise<DashboardData>;
    getTestStatus(): Promise<TestStatus>;
    runTests(tests?: string[] | null): Promise<{
        message: string;
        status: TestStatus;
    }>;
    getTestOutput(since?: number): Promise<TestOutputResponse>;
    getTestRuns(testId: string, options?: {
        limit?: number;
        offset?: number;
        includeFailures?: boolean;
    }): Promise<{
        testId: string;
        totalRuns: number;
        runs: TestRun[];
    }>;
    compareTestRuns(params: {
        testId?: string;
        timeRangeDays?: number;
        compareBy?: 'testFile' | 'testType' | 'branch';
    }): Promise<Record<string, unknown>>;
    getTestRecommendations(params?: {
        timeRangeDays?: number;
        limit?: number;
        testType?: string;
        branch?: string;
        includeCoverage?: boolean;
        includeFlakiness?: boolean;
        includePerformance?: boolean;
    }): Promise<Record<string, unknown>>;
    getTestAlerts(params?: {
        timeRangeDays?: number;
        severity?: string;
        testType?: string;
        branch?: string;
    }): Promise<Record<string, unknown>>;
    analyzeTestDependencies(params: {
        filePaths?: string[];
        testType?: string;
        includeImpact?: boolean;
    }): Promise<Record<string, unknown>>;
    getMTTR(): Promise<Record<string, unknown>>;
    getChronicOffenders(threshold?: number): Promise<Record<string, unknown>>;
    getTestStatistics(params?: {
        timeRangeDays?: number;
        testType?: string;
        branch?: string;
    }): Promise<Record<string, unknown>>;
    getActiveFailures(params?: {
        limit?: number;
    }): Promise<ActiveFailuresResponse>;
    getFlakeDetection(params?: {
        timeRangeDays?: number;
        suite?: string;
    }): Promise<Record<string, unknown>>;
    getTrends(params?: {
        timeRangeDays?: number;
        suite?: string;
        branch?: string;
        env?: string;
    }): Promise<{
        summary: {
            totalRuns: number;
            totalPassed: number;
            totalFailed: number;
            passRate: number;
            byTestType: Record<string, unknown>;
        };
        trends: Array<{
            date: string;
            passed: number;
            failed: number;
            total: number;
            passRate: number;
        }>;
    }>;
    getPerformanceDrift(params?: {
        baselineWindowDays?: number;
        thresholdPercent?: number;
        suite?: string;
        branch?: string;
        env?: string;
    }): Promise<{
        regressions: Array<{
            test_id: string;
            suite: string;
            current_duration: number;
            baseline_duration: number;
            increase_percent: number;
            status: 'regression' | 'warning';
            trend: string;
        }>;
        warnings: Array<{
            test_id: string;
            suite: string;
            current_duration: number;
            baseline_duration: number;
            increase_percent: number;
            status: 'regression' | 'warning';
            trend: string;
        }>;
        summary: {
            total_tests_analyzed: number;
            total_regressions: number;
            total_warnings: number;
        };
    }>;
    getWhatBrokeWhen(params?: {
        timeRangeDays?: number;
        suite?: string;
        branch?: string;
    }): Promise<Record<string, unknown>>;
    getErrorLogs(params?: {
        severity?: string;
        component?: string;
        testRunId?: string;
        timeRange?: string;
        limit?: number;
        skip?: number;
        errorCategory?: string;
        errorPattern?: string;
        errorMessage?: string;
        testFilePath?: string;
        minOccurrences?: number;
        errorFingerprint?: string;
        startDate?: string;
        endDate?: string;
        sort?: string;
        sortOrder?: string;
    }): Promise<Record<string, unknown>>;
    getFailurePatterns(params?: {
        timeRangeDays?: number;
    }): Promise<Record<string, unknown>>;
    getPerformanceTrends(params?: {
        timeRangeDays?: number;
        includeRegressions?: boolean;
    }): Promise<Record<string, unknown>>;
    getCoverageMetrics(params?: number | {
        timeRangeDays?: number;
    }): Promise<Record<string, unknown>>;
    getWorkflowStepsStatus(): Promise<Record<string, unknown>>;
    getLogFiles(testId: string, options?: {
        content?: boolean;
    }): Promise<Record<string, unknown>>;
    getPipeline(pipelineId: string): Promise<Record<string, unknown>>;
    getScheduledExports(): Promise<{
        scheduledExports: ScheduledExport[];
    }>;
    createScheduledExport(config: ScheduledExportConfig): Promise<{
        scheduledExport: ScheduledExport;
    }>;
    updateScheduledExport(id: string, updates: Partial<ScheduledExportConfig>): Promise<{
        scheduledExport: ScheduledExport;
    }>;
    deleteScheduledExport(id: string): Promise<{
        message: string;
        id: string;
    }>;
    executeScheduledExport(id: string): Promise<Blob>;
    runWorkflowStepsHealthCheck(): Promise<{
        success: boolean;
        output: string[];
        exitCode: number | null;
        error?: string;
        command: string;
        runId?: string;
    }>;
    runWorkflowStepsTests(): Promise<{
        success: boolean;
        output: string[];
        exitCode: number | null;
        error?: string;
        command: string;
        runId?: string;
    }>;
    collectWorkflowStepsBugs(): Promise<{
        success: boolean;
        output: string[];
        exitCode: number | null;
        error?: string;
        command: string;
        runId?: string;
    }>;
    generateWorkflowStepsReport(): Promise<{
        success: boolean;
        output: string[];
        exitCode: number | null;
        error?: string;
        command: string;
        reportPath?: string;
        runId?: string;
    }>;
    cancelWorkflowStepsCommand(commandType: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get the command queue status
     */
    getCommandQueue(): Promise<{
        queue: QueuedCommand[];
    }>;
    /**
     * Cancel a queued command by ID
     */
    cancelQueuedCommand(id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Clear all queued commands
     */
    clearCommandQueue(): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Execute a pnpm command and get output
     * Returns: { success: boolean, status?: 'queued', output?: string[], exitCode?: number | null, error?: string, command: string, message?: string, queueId?: string }
     */
    executeCommand(command: string): Promise<{
        success: boolean;
        status?: 'queued';
        output?: string[];
        exitCode?: number | null;
        error?: string;
        command: string;
        message?: string;
        queueId?: string;
    }>;
    getWorkflowStepsExecutionHistory(limit?: number): Promise<{
        history: Array<{
            id: string;
            command: string;
            commandType: 'health' | 'run' | 'collect-bugs' | 'generate-report' | 'custom';
            timestamp: string;
            status: 'running' | 'success' | 'error';
            exitCode?: number | null;
            duration?: number;
            outputLines?: number;
            error?: string;
        }>;
        total: number;
        limit: number;
    }>;
}
