/**
 * Failure Pattern Analysis Widget
 *
 * Displays failure patterns, summary statistics, and recommendations.
 */
import type { TestApiService } from '../../services/api/TestApiService';
interface FailurePatternAnalysisWidgetProps {
    testApiService: TestApiService;
    autoLoad?: boolean;
}
export declare function FailurePatternAnalysisWidget({ testApiService, autoLoad, }: FailurePatternAnalysisWidgetProps): import("react/jsx-runtime").JSX.Element;
export {};
