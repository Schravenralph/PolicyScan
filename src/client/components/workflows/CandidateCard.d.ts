/**
 * Candidate Card Component
 *
 * Individual candidate result card in the review dialog.
 */
interface CandidateResult {
    id: string;
    title: string;
    url: string;
    snippet?: string;
    metadata?: Record<string, unknown>;
    reviewStatus: 'pending' | 'accepted' | 'rejected';
    reviewNotes?: string;
}
interface CandidateCardProps {
    candidate: CandidateResult;
    isAccepted: boolean;
    isRejected: boolean;
    isExpanded: boolean;
    onToggle: (checked: boolean) => void;
    onToggleExpansion: () => void;
}
export declare function CandidateCard({ candidate, isAccepted, isRejected, isExpanded, onToggle, onToggleExpansion, }: CandidateCardProps): import("react/jsx-runtime").JSX.Element;
export {};
