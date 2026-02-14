import { ReactNode } from 'react';
import type { WorkflowDocument } from '../services/api/WorkflowApiService';
interface WorkflowContextType {
    workflows: WorkflowDocument[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
    getWorkflowById: (id: string) => WorkflowDocument | undefined;
}
export declare function WorkflowProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export declare function useWorkflows(): WorkflowContextType;
export {};
