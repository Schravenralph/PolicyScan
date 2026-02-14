/**
 * Test Dependencies Page
 *
 * Analyzes test dependencies, relationships, and impact of changes.
 */
import { TestApiService } from '../services/api/TestApiService';
interface TestDependenciesPageProps {
    testApiService?: TestApiService;
}
export declare function TestDependenciesPage({ testApiService: injectedTestApiService }?: TestDependenciesPageProps): import("react/jsx-runtime").JSX.Element;
export {};
