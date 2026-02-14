/**
 * Test Advanced Search Component
 *
 * Advanced search interface for test runs with multiple filters and query options.
 */
import { TestApiService } from '../../services/api/TestApiService';
interface TestAdvancedSearchProps {
    testApiService?: TestApiService;
    onResults?: (results: any[]) => void;
}
export declare function TestAdvancedSearch({ testApiService: injectedTestApiService, onResults }: TestAdvancedSearchProps): import("react/jsx-runtime").JSX.Element;
export {};
