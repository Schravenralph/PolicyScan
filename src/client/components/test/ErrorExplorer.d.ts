import { TestApiService } from '../../services/api/TestApiService';
interface ErrorExplorerProps {
    dateRange?: {
        from?: Date;
        to?: Date;
    };
    testApiService?: TestApiService;
}
export declare function ErrorExplorer({ dateRange, testApiService: injectedTestApiService }: ErrorExplorerProps): import("react/jsx-runtime").JSX.Element;
export {};
