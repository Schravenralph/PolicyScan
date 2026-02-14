import { TestApiService } from '../../services/api/TestApiService';
interface ErrorPatternsProps {
    dateRange?: {
        from?: Date;
        to?: Date;
    };
    testApiService?: TestApiService;
}
export declare function ErrorPatterns({ dateRange, testApiService: injectedTestApiService }: ErrorPatternsProps): import("react/jsx-runtime").JSX.Element;
export {};
