import type { KGStatus } from '../../services/api/KnowledgeGraphManagementApiService';
interface KGStatusBannerProps {
    status: KGStatus | null;
}
export declare function KGStatusBanner({ status }: KGStatusBannerProps): import("react/jsx-runtime").JSX.Element | null;
export {};
