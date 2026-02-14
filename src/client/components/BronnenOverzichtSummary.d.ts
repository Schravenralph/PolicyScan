/**
 * BronnenOverzicht Summary Component
 *
 * Title, description, search parameters summary, and status overview.
 */
import type { NormalizedScanParameters } from '../types/scanParameters';
interface BronnenOverzichtSummaryProps {
    normalizedParams: NormalizedScanParameters;
    totalBronnen: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
}
export declare function BronnenOverzichtSummary({ normalizedParams, totalBronnen, pendingCount, approvedCount, rejectedCount, }: BronnenOverzichtSummaryProps): import("react/jsx-runtime").JSX.Element;
export {};
