interface BenchmarkResult {
    id: string;
    benchmarkType: string;
    configName: string;
    documents: Array<{
        url: string;
        titel: string;
        samenvatting: string;
        score: number;
        rank: number;
    }>;
    metrics: {
        documentsFound: number;
        averageScore: number;
    };
}
interface BenchmarkRun {
    id: string;
    name: string;
    query?: string;
    queries?: string[];
    benchmarkTypes: string[];
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
    completedAt?: string;
    cancelledAt?: string;
    results?: BenchmarkResult[];
}
interface BenchmarkResultsListProps {
    runs: BenchmarkRun[];
    onSelectRun: (run: BenchmarkRun) => void;
    onCancelRun?: (runId: string) => void;
}
export declare function BenchmarkResultsList({ runs, onSelectRun, onCancelRun }: BenchmarkResultsListProps): import("react/jsx-runtime").JSX.Element;
export {};
