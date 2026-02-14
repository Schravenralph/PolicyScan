/**
 * Test Recommendations Page
 *
 * Displays actionable recommendations for improving test quality, stability, and coverage.
 */
import { TestApiService } from '../services/api/TestApiService';
interface TestRecommendationsPageProps {
    testApiService?: TestApiService;
}
export declare function TestRecommendationsPage({ testApiService: injectedTestApiService }?: TestRecommendationsPageProps): import("react/jsx-runtime").JSX.Element;
export {};
