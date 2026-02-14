/**
 * DualWriteService
 *
 * ✅ **MIGRATED** - Legacy writes are now disabled by default.
 *
 * Phase B: Dual-write ingestion wrapper for v2 rollout.
 * Now only writes to canonical store (v2) - legacy writes disabled.
 *
 * **Migration Status:**
 * - ✅ Legacy writes disabled by default (MIGRATION_LEGACY_WRITE_ENABLED defaults to false)
 * - ✅ Only writes to canonical store
 * - ✅ Can be re-enabled via feature flag for monitoring if needed
 *
 * **Migration Reference:**
 * - WI-414: Backend Write Operations Migration
 * - See `docs/70-sprint-backlog/WI-414-backend-write-operations-migration.md`
 *
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/13-migrations-and-backfills.md
 * @see WI-414: Backend Write Operations Migration
 */
import type { BronDocumentCreateInput } from '../../types/index.js';
import type { CanonicalDocumentDraft, ServiceContext } from '../../contracts/types.js';
/**
 * Dual-write result
 */
export interface DualWriteResult {
    legacyWrite?: {
        success: boolean;
        documentId?: string;
        error?: Error;
    };
    canonicalWrite: {
        success: boolean;
        documentId?: string;
        error?: Error;
    };
    comparison?: {
        fieldsMatch: boolean;
        differences?: string[];
    };
}
/**
 * DualWriteService - Writes to both legacy and canonical stores
 */
export declare class DualWriteService {
    private canonicalService;
    private featureFlags;
    private legacyWriteEnabled;
    constructor();
    /**
     * Write document to both legacy and canonical stores
     *
     * @param legacyInput - Legacy document input (for brondocumenten collection)
     * @param canonicalDraft - Canonical document draft (for canonical_documents collection)
     * @param ctx - Service context (may include session for transactions)
     * @returns Dual-write result with comparison
     */
    dualWrite(legacyInput: BronDocumentCreateInput, canonicalDraft: CanonicalDocumentDraft, ctx?: ServiceContext): Promise<DualWriteResult>;
    /**
     * Compare legacy and canonical writes
     *
     * @param legacyDoc - Legacy document
     * @param canonicalDraft - Canonical document draft
     * @returns Comparison result
     */
    private compareWrites;
    /**
     * Check if legacy write is enabled
     */
    isLegacyWriteEnabled(): boolean;
    /**
     * Refresh legacy write flag from feature flags
     */
    refreshLegacyWriteFlag(): void;
}
/**
 * Get singleton instance of DualWriteService
 */
export declare function getDualWriteService(): DualWriteService;
