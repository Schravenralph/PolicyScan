import type { TestApiService } from '../services/api/TestApiService';
export interface PipelineStep {
    stepNumber: number;
    stepName: string;
    status: 'passed' | 'failed' | 'skipped';
    scenarios: {
        total: number;
        passed: number;
        failed: number;
    };
    duration?: number;
}
export interface PipelineDetails {
    steps: PipelineStep[];
    statistics: {
        totalScenarios: number;
        passedScenarios: number;
        failedScenarios: number;
        passRate: number;
    };
    loading?: boolean;
    error?: string;
}
export declare function usePipelineVisualization(testApiService: TestApiService): {
    expandedPipelines: Set<string>;
    pipelineDetails: Record<string, PipelineDetails>;
    loadPipelineDetails: (pipelineId: string) => Promise<void>;
    togglePipelineExpansion: (pipelineId: string) => void;
};
