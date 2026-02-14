import { TestApiService, ActiveFailure } from '../services/api/TestApiService';
export interface ActiveFailuresState {
    total: number;
    newCount: number;
    failures?: ActiveFailure[];
}
interface UseActiveFailuresResult {
    activeFailures: ActiveFailuresState | null;
    activeFailuresLoading: boolean;
    loadActiveFailures: () => Promise<void>;
}
export declare function useActiveFailures(testApi: TestApiService): UseActiveFailuresResult;
export {};
