/**
 * Test Result Annotations Component
 *
 * Component for viewing and managing annotations, comments, and tags for test results.
 */
import { TestAnnotationApiService } from '../../services/api/TestAnnotationApiService';
interface TestResultAnnotationsProps {
    runId: string;
    testId?: string;
    testApiService?: TestAnnotationApiService;
}
export declare function TestResultAnnotations({ runId, testId, testApiService: injectedApiService }: TestResultAnnotationsProps): import("react/jsx-runtime").JSX.Element;
export {};
