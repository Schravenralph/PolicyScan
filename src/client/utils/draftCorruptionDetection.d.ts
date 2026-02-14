/**
 * Draft Corruption Detection - Detects and recovers from corrupted draft data
 *
 * Provides utilities for detecting corrupted drafts and attempting recovery.
 */
import type { BeleidsscanDraft } from '../hooks/useDraftPersistence';
export interface CorruptionCheckResult {
    isCorrupted: boolean;
    errors: string[];
    warnings: string[];
    recoverable: boolean;
    recoveredDraft?: BeleidsscanDraft;
}
/**
 * Check if draft data is corrupted
 */
export declare function checkDraftCorruption(draft: unknown): CorruptionCheckResult;
/**
 * Attempt to recover corrupted draft
 */
export declare function recoverCorruptedDraft(corruptedDraft: unknown): BeleidsscanDraft | null;
/**
 * Validate draft before saving
 */
export declare function validateDraftBeforeSave(draft: BeleidsscanDraft): {
    valid: boolean;
    errors: string[];
};
