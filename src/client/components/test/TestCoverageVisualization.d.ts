/**
 * Test Coverage Visualization
 *
 * Visual representation of test coverage with file-level breakdown.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestCoverageVisualizationProps {
    testApiService?: TestApiService;
    timeRangeDays?: number;
}
export declare function TestCoverageVisualization({ testApiService: injectedTestApiService, timeRangeDays }: TestCoverageVisualizationProps): import("react/jsx-runtime").JSX.Element;
export {};
