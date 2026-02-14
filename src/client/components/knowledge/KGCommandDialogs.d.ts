import type { KGStatus } from '../../services/api/KnowledgeGraphManagementApiService';
interface KGCommandDialogsProps {
    status: KGStatus | null;
    commitDialogOpen: boolean;
    onCommitDialogChange: (open: boolean) => void;
    commitMessage: string;
    onCommitMessageChange: (message: string) => void;
    onExecuteCommit: () => void;
    stashDialogOpen: boolean;
    onStashDialogChange: (open: boolean) => void;
    stashDescription: string;
    onStashDescriptionChange: (description: string) => void;
    onExecuteStash: () => void;
    branchDialogOpen: boolean;
    onBranchDialogChange: (open: boolean) => void;
    branches: Array<{
        name: string;
        isCurrent: boolean;
    }>;
    newBranchName: string;
    onNewBranchNameChange: (name: string) => void;
    onSwitchBranch: (branchName: string) => void;
    onCreateBranch: () => void;
    mergeDialogOpen: boolean;
    onMergeDialogChange: (open: boolean) => void;
    mergeSource: string;
    onMergeSourceChange: (source: string) => void;
    mergeTarget: string;
    onMergeTargetChange: (target: string) => void;
    onExecuteMerge: () => void;
    diffDialogOpen: boolean;
    onDiffDialogChange: (open: boolean) => void;
    diffSource: string;
    onDiffSourceChange: (source: string) => void;
    diffTarget: string;
    onDiffTargetChange: (target: string) => void;
    diffResult: {
        entities: {
            added: string[];
            removed: string[];
            modified: string[];
            addedCount: number;
            removedCount: number;
            modifiedCount: number;
        };
        relationships: {
            added: Array<{
                sourceId: string;
                targetId: string;
                type: string;
            }>;
            removed: Array<{
                sourceId: string;
                targetId: string;
                type: string;
            }>;
            modified: Array<{
                sourceId: string;
                targetId: string;
                type: string;
            }>;
            addedCount: number;
            removedCount: number;
            modifiedCount: number;
        };
    } | null;
    onExecuteDiff: () => void;
    onClearDiffResult: () => void;
    logDialogOpen: boolean;
    onLogDialogChange: (open: boolean) => void;
    versionLog: Array<{
        version: string;
        branch: string;
        timestamp: string;
    }>;
    onLoadVersionLog: () => void;
    stashListDialogOpen: boolean;
    onStashListDialogChange: (open: boolean) => void;
    stashes: Array<{
        stashId: string;
        branch: string;
        timestamp: string;
        description?: string;
    }>;
    onLoadStashes: () => void;
    onPopStash: (stashId: string) => void;
    onDropStash: (stashId: string) => void;
}
export declare function KGCommandDialogs({ status, commitDialogOpen, onCommitDialogChange, commitMessage, onCommitMessageChange, onExecuteCommit, stashDialogOpen, onStashDialogChange, stashDescription, onStashDescriptionChange, onExecuteStash, branchDialogOpen, onBranchDialogChange, branches, newBranchName, onNewBranchNameChange, onSwitchBranch, onCreateBranch, mergeDialogOpen, onMergeDialogChange, mergeSource, onMergeSourceChange, mergeTarget, onMergeTargetChange, onExecuteMerge, diffDialogOpen, onDiffDialogChange, diffSource, onDiffSourceChange, diffTarget, onDiffTargetChange, diffResult, onExecuteDiff, onClearDiffResult, logDialogOpen, onLogDialogChange, versionLog, onLoadVersionLog, stashListDialogOpen, onStashListDialogChange, stashes, onLoadStashes, onPopStash, onDropStash, }: KGCommandDialogsProps): import("react/jsx-runtime").JSX.Element;
export {};
