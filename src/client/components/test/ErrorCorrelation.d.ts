import { TestApiService } from '../../services/api/TestApiService';
interface ErrorCorrelationProps {
    dateRange?: {
        from?: Date;
        to?: Date;
    };
    onDrillDown?: (filters: {
        testFilePath?: string;
        gitCommit?: string;
        environment?: string;
    }) => void;
    testApiService?: TestApiService;
}
export declare function ErrorCorrelation({ dateRange, onDrillDown, testApiService: injectedTestApiService }: ErrorCorrelationProps): import("react/jsx-runtime").JSX.Element;
export {};
