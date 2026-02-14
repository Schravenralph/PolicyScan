import { TestApiService } from '../../services/api/TestApiService';
interface ErrorOverviewProps {
    dateRange?: {
        from?: Date;
        to?: Date;
    };
    testApiService?: TestApiService;
}
export declare function ErrorOverview({ dateRange, testApiService: injectedTestApiService }: ErrorOverviewProps): import("react/jsx-runtime").JSX.Element;
export {};
