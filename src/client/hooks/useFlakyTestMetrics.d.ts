import { TestApiService } from '../services/api/TestApiService';
export interface FlakyTestMetricsState {
    totalFlakyTests: number;
    flakyTests: Array<{
        test_id?: string;
        suite?: string;
        total_runs: number;
        pass_rate: number;
        flake_rate: number;
        recent_failures: number;
    }>;
}
interface UseFlakyTestMetricsResult {
    flakyTestMetrics: FlakyTestMetricsState | null;
    flakyTestMetricsLoading: boolean;
    loadFlakyTestMetrics: () => Promise<void>;
}
export declare function useFlakyTestMetrics(testApi: TestApiService): UseFlakyTestMetricsResult;
export {};
