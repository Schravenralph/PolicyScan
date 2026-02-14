import type { KGStatus } from '../../services/api/KnowledgeGraphManagementApiService';
interface KGCommandPanelProps {
    status: KGStatus | null;
    loading: boolean;
    onCommand: (command: string) => void;
    onStashList: () => void;
}
export declare function KGCommandPanel({ status, loading, onCommand, onStashList, }: KGCommandPanelProps): import("react/jsx-runtime").JSX.Element;
export {};
