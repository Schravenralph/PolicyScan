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
  commandType: string; // 'health', 'run', 'collect-bugs', 'generate-report', or custom ID
  scriptPath?: string;
  args?: string[];
  commandString?: string; // For pnpm commands
  status: 'queued' | 'running';
  timestamp: number;
  originalCommand?: string; // For display purposes
}

export class TestApiService extends BaseApiService {
  private buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  async getDashboardData(limit: number = 25, offset: number = 0): Promise<DashboardData> {
    const query = this.buildQuery({ limit, offset });
    return this.get(`/tests/dashboard-data${query}`);
  }

  async getTestStatus(): Promise<TestStatus> {
    return this.get('/tests/status');
  }

  async runTests(tests?: string[] | null): Promise<{ message: string; status: TestStatus }> {
    return this.post('/tests/run', { tests: tests && tests.length > 0 ? tests : null });
  }

  async getTestOutput(since: number = 0): Promise<TestOutputResponse> {
    const query = this.buildQuery({ since });
    return this.get(`/tests/output${query}`);
  }

  async getTestRuns(
    testId: string,
    options: { limit?: number; offset?: number; includeFailures?: boolean } = {}
  ): Promise<{ testId: string; totalRuns: number; runs: TestRun[] }> {
    const query = this.buildQuery({
      limit: options.limit,
      offset: options.offset,
      includeFailures: options.includeFailures,
    });
    return this.get(`/tests/${encodeURIComponent(testId)}/runs${query}`);
  }

  async compareTestRuns(params: {
    testId?: string;
    timeRangeDays?: number;
    compareBy?: 'testFile' | 'testType' | 'branch';
  }): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      testId: params.testId,
      timeRangeDays: params.timeRangeDays,
      compareBy: params.compareBy,
    });
    return this.get(`/tests/compare-runs${query}`);
  }

  async getTestRecommendations(params: {
    timeRangeDays?: number;
    limit?: number;
    testType?: string;
    branch?: string;
    includeCoverage?: boolean;
    includeFlakiness?: boolean;
    includePerformance?: boolean;
  } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      timeRangeDays: params.timeRangeDays,
      limit: params.limit,
      testType: params.testType,
      branch: params.branch,
      includeCoverage: params.includeCoverage,
      includeFlakiness: params.includeFlakiness,
      includePerformance: params.includePerformance,
    });
    return this.get(`/tests/recommendations${query}`);
  }

  async getTestAlerts(params: {
    timeRangeDays?: number;
    severity?: string;
    testType?: string;
    branch?: string;
  } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      timeRangeDays: params.timeRangeDays,
      severity: params.severity,
      testType: params.testType,
      branch: params.branch,
    });
    return this.get(`/tests/alerts${query}`);
  }

  async analyzeTestDependencies(params: {
    filePaths?: string[];
    testType?: string;
    includeImpact?: boolean;
  }): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      filePaths: params.filePaths?.join(','),
      testType: params.testType,
      includeImpact: params.includeImpact,
    });
    return this.get(`/tests/dependencies${query}`);
  }

  async getMTTR(): Promise<Record<string, unknown>> {
    return this.get('/tests/failures/analytics/mttr');
  }

  async getChronicOffenders(threshold?: number): Promise<Record<string, unknown>> {
    const query = this.buildQuery({ threshold });
    return this.get(`/tests/failures/analytics/chronic-offenders${query}`);
  }

  async getTestStatistics(params: { timeRangeDays?: number; testType?: string; branch?: string } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      timeRangeDays: params.timeRangeDays,
      testType: params.testType,
      branch: params.branch,
    });
    return this.get(`/tests/test-discovery${query}`);
  }

  async getActiveFailures(params: { limit?: number } = {}): Promise<ActiveFailuresResponse> {
    const query = this.buildQuery({ limit: params.limit });
    return this.get(`/tests/failures/active${query}`);
  }

  async getFlakeDetection(params: { timeRangeDays?: number; suite?: string } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      timeRangeDays: params.timeRangeDays,
      suite: params.suite,
    });
    return this.get(`/tests/flake-detection${query}`);
  }

  async getTrends(params: {
    timeRangeDays?: number;
    suite?: string;
    branch?: string;
    env?: string;
  } = {}): Promise<{
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
  }> {
    const query = this.buildQuery({
      timeRangeDays: params.timeRangeDays,
      suite: params.suite,
      branch: params.branch,
      env: params.env,
    });
    return this.get(`/tests/analytics${query}`);
  }

  async getPerformanceDrift(params: {
    baselineWindowDays?: number;
    thresholdPercent?: number;
    suite?: string;
    branch?: string;
    env?: string;
  } = {}): Promise<{
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
  }> {
    const query = this.buildQuery({
      baselineWindowDays: params.baselineWindowDays,
      thresholdPercent: params.thresholdPercent,
      suite: params.suite,
      branch: params.branch,
      env: params.env,
    });
    return this.get(`/tests/performance-drift${query}`);
  }

  async getWhatBrokeWhen(params: {
    timeRangeDays?: number;
    suite?: string;
    branch?: string;
  } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      timeRangeDays: params.timeRangeDays,
      suite: params.suite,
      branch: params.branch,
    });
    return this.get(`/tests/what-broke-when${query}`);
  }

  async getErrorLogs(params: {
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
  } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      severity: params.severity,
      component: params.component,
      testRunId: params.testRunId,
      timeRange: params.timeRange,
      limit: params.limit,
      skip: params.skip,
      errorCategory: params.errorCategory,
      errorPattern: params.errorPattern,
      errorMessage: params.errorMessage,
      testFilePath: params.testFilePath,
      minOccurrences: params.minOccurrences,
      errorFingerprint: params.errorFingerprint,
      startDate: params.startDate,
      endDate: params.endDate,
      sort: params.sort,
      sortOrder: params.sortOrder,
    });
    return this.get(`/tests/errors${query}`);
  }

  async getFailurePatterns(params: { timeRangeDays?: number } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({ timeRangeDays: params.timeRangeDays });
    return this.get(`/tests/failure-patterns${query}`);
  }

  async getPerformanceTrends(params: { timeRangeDays?: number; includeRegressions?: boolean } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({
      timeRangeDays: params.timeRangeDays,
      includeRegressions: params.includeRegressions,
    });
    return this.get(`/tests/performance-trends${query}`);
  }

  async getCoverageMetrics(params?: number | { timeRangeDays?: number }): Promise<Record<string, unknown>> {
    // Support both number (timeRangeDays) and object format for backward compatibility
    const timeRangeDays = typeof params === 'number' ? params : params?.timeRangeDays;
    const query = this.buildQuery({ timeRangeDays });
    return this.get(`/tests/coverage-metrics${query}`);
  }

  async getWorkflowStepsStatus(): Promise<Record<string, unknown>> {
    return this.get('/tests/workflow-steps/status');
  }

  async getLogFiles(testId: string, options: { content?: boolean } = {}): Promise<Record<string, unknown>> {
    const query = this.buildQuery({ content: options.content });
    return this.get(`/tests/${encodeURIComponent(testId)}/log-files${query}`);
  }

  async getPipeline(pipelineId: string): Promise<Record<string, unknown>> {
    return this.get(`/tests/pipelines/${encodeURIComponent(pipelineId)}`);
  }

  async getScheduledExports(): Promise<{ scheduledExports: ScheduledExport[] }> {
    return this.get('/tests/scheduled-exports');
  }

  async createScheduledExport(config: ScheduledExportConfig): Promise<{ scheduledExport: ScheduledExport }> {
    return this.post('/tests/scheduled-exports', config);
  }

  async updateScheduledExport(id: string, updates: Partial<ScheduledExportConfig>): Promise<{ scheduledExport: ScheduledExport }> {
    return this.put(`/tests/scheduled-exports/${encodeURIComponent(id)}`, updates);
  }

  async deleteScheduledExport(id: string): Promise<{ message: string; id: string }> {
    return this.delete(`/tests/scheduled-exports/${encodeURIComponent(id)}`);
  }

  async executeScheduledExport(id: string): Promise<Blob> {
    return this.request<Blob>(`/tests/scheduled-exports/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      responseType: 'blob',
    });
  }

  // Workflow Steps Execution Methods
  async runWorkflowStepsHealthCheck(): Promise<{
    success: boolean;
    output: string[];
    exitCode: number | null;
    error?: string;
    command: string;
    runId?: string;
  }> {
    return this.post('/tests/workflow-steps/health', {});
  }

  async runWorkflowStepsTests(): Promise<{
    success: boolean;
    output: string[];
    exitCode: number | null;
    error?: string;
    command: string;
    runId?: string;
  }> {
    return this.post('/tests/workflow-steps/run', {});
  }

  async collectWorkflowStepsBugs(): Promise<{
    success: boolean;
    output: string[];
    exitCode: number | null;
    error?: string;
    command: string;
    runId?: string;
  }> {
    return this.post('/tests/workflow-steps/collect-bugs', {});
  }

  async generateWorkflowStepsReport(): Promise<{
    success: boolean;
    output: string[];
    exitCode: number | null;
    error?: string;
    command: string;
    reportPath?: string;
    runId?: string;
  }> {
    return this.post('/tests/workflow-steps/generate-report', {});
  }

  async cancelWorkflowStepsCommand(commandType: string): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.post(`/tests/workflow-steps/${encodeURIComponent(commandType)}/cancel`, {});
  }

  /**
   * Get the command queue status
   */
  async getCommandQueue(): Promise<{ queue: QueuedCommand[] }> {
    return this.get('/tests/workflow-steps/queue');
  }

  /**
   * Cancel a queued command by ID
   */
  async cancelQueuedCommand(id: string): Promise<{ success: boolean; message: string }> {
    return this.delete(`/tests/workflow-steps/queue/${id}`);
  }

  /**
   * Clear all queued commands
   */
  async clearCommandQueue(): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.delete('/tests/workflow-steps/queue');
  }

  /**
   * Execute a pnpm command and get output
   * Returns: { success: boolean, status?: 'queued', output?: string[], exitCode?: number | null, error?: string, command: string, message?: string, queueId?: string }
   */
  async executeCommand(command: string): Promise<{
    success: boolean;
    status?: 'queued';
    output?: string[];
    exitCode?: number | null;
    error?: string;
    command: string;
    message?: string;
    queueId?: string;
  }> {
    return this.post('/tests/workflow-steps/execute', { command });
  }

  async getWorkflowStepsExecutionHistory(limit: number = 20): Promise<{
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
  }> {
    const query = this.buildQuery({ limit });
    return this.get(`/tests/workflow-steps/history${query}`);
  }
}
