interface LearningCycleResult {
    rankingBoosts: Array<{
        documentId: string;
        boost: number;
        reason: string;
    }>;
    dictionaryUpdates: Array<{
        term: string;
        synonyms: string[];
        confidence: number;
    }>;
    sourceUpdates: Array<{
        sourceUrl: string;
        qualityScore: number;
        deprecated: boolean;
    }>;
    metrics: {
        documentQuality: Array<{
            documentId: string;
            clicks: number;
            accepts: number;
            rejects: number;
            rating: number;
            qualityScore: number;
        }>;
        sourceQuality: Array<{
            sourceUrl: string;
            documentCount: number;
            averageRating: number;
            acceptanceRate: number;
            clickThroughRate: number;
            qualityScore: number;
        }>;
        termImportance: Array<{
            term: string;
            frequency: number;
            averageRating: number;
            associatedAcceptRate: number;
            importanceScore: number;
        }>;
        overallCTR: number;
        overallAcceptanceRate: number;
    };
}
interface CycleStatus {
    status: 'idle' | 'running' | 'completed' | 'failed' | 'disabled';
    enabled?: boolean;
    message?: string;
    currentCycle?: {
        operationId: string;
        startTime: string;
    };
    lastCycle?: {
        operationId: string;
        status: 'completed' | 'failed';
        completedAt: string;
        error?: string;
    };
}
interface CycleHistoryItem {
    operationId: string;
    status: 'completed' | 'failed';
    startTime: string;
    endTime: string;
    duration: number;
    result?: {
        rankingBoostsCount: number;
        dictionaryUpdatesCount: number;
        sourceUpdatesCount: number;
        sourcesDeprecated: number;
        termsAdded: number;
        synonymsAdded: number;
        overallCTR: number;
        overallAcceptanceRate: number;
    };
    error?: string;
}
interface LearningControlsProps {
    onRunCycle: () => Promise<void>;
    running: boolean;
    lastResult: LearningCycleResult | null;
    cycleStatus?: CycleStatus | null;
    history?: CycleHistoryItem[];
    historyLoading?: boolean;
    showHistory?: boolean;
    onToggleHistory?: () => void;
    onRefreshHistory?: () => void;
}
export declare function LearningControls({ onRunCycle, running, lastResult, cycleStatus, history, historyLoading, showHistory, onToggleHistory, onRefreshHistory, }: LearningControlsProps): import("react/jsx-runtime").JSX.Element;
export {};
