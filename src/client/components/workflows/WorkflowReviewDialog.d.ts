interface WorkflowReviewDialogProps {
    runId: string;
    workflowId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onReviewComplete: () => void;
}
export declare function WorkflowReviewDialog({ runId, workflowId, open, onOpenChange, onReviewComplete }: WorkflowReviewDialogProps): import("react/jsx-runtime").JSX.Element | null;
export {};
