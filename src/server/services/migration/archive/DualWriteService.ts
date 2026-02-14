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

import { logger } from '../../../utils/logger.js';
import { BronDocument } from '../../../models/BronDocument.js';
import type { BronDocumentCreateInput, BronDocumentDocument } from '../../../types/index.js';
import { CanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import type { CanonicalDocumentDraft, ServiceContext } from '../../../contracts/types.js';
import { FeatureFlagsService } from '../../knowledge-graph/KnowledgeGraphFeatureFlags.js';
import type { ClientSession } from 'mongodb';

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
export class DualWriteService {
  private canonicalService: CanonicalDocumentService;
  private featureFlags: FeatureFlagsService;
  private legacyWriteEnabled: boolean;

  constructor() {
    this.canonicalService = new CanonicalDocumentService();
    this.featureFlags = new FeatureFlagsService();
    // Legacy writes disabled by default - all critical write paths now use canonical service
    // Can be re-enabled via feature flag for monitoring/comparison if needed
    this.legacyWriteEnabled = this.featureFlags.isEnabled('MIGRATION_LEGACY_WRITE_ENABLED', false);
  }

  /**
   * Write document to both legacy and canonical stores
   * 
   * @param legacyInput - Legacy document input (for brondocumenten collection)
   * @param canonicalDraft - Canonical document draft (for canonical_documents collection)
   * @param ctx - Service context (may include session for transactions)
   * @returns Dual-write result with comparison
   */
  async dualWrite(
    legacyInput: BronDocumentCreateInput,
    canonicalDraft: CanonicalDocumentDraft,
    ctx?: ServiceContext
  ): Promise<DualWriteResult> {
    const result: DualWriteResult = {
      canonicalWrite: { success: false },
    };

    // Always write to canonical store (v2)
    try {
      const canonicalDoc = await this.canonicalService.upsertBySourceId(canonicalDraft, ctx || {});
      result.canonicalWrite = {
        success: true,
        documentId: canonicalDoc._id,
      };
    } catch (error) {
      logger.error({ error, source: canonicalDraft.source, sourceId: canonicalDraft.sourceId }, 'Failed to write to canonical store');
      result.canonicalWrite = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    // Conditionally write to legacy store
    if (this.legacyWriteEnabled) {
      try {
        const legacyDoc = await BronDocument.create(legacyInput, ctx?.session as ClientSession | undefined);
        result.legacyWrite = {
          success: true,
          documentId: legacyDoc._id?.toString(),
        };

        // Compare outputs if both writes succeeded
        if (result.canonicalWrite.success && result.legacyWrite.success) {
          result.comparison = this.compareWrites(legacyDoc, canonicalDraft);
        }
      } catch (error) {
        logger.error({ error, url: legacyInput.url }, 'Failed to write to legacy store');
        result.legacyWrite = {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }

    // Log comparison results for monitoring
    if (result.comparison && !result.comparison.fieldsMatch) {
      logger.warn(
        {
          source: canonicalDraft.source,
          sourceId: canonicalDraft.sourceId,
          differences: result.comparison.differences,
        },
        'Dual-write comparison detected differences'
      );
    }

    return result;
  }

  /**
   * Compare legacy and canonical writes
   * 
   * @param legacyDoc - Legacy document
   * @param canonicalDraft - Canonical document draft
   * @returns Comparison result
   */
  private compareWrites(
    legacyDoc: BronDocumentDocument,
    canonicalDraft: CanonicalDocumentDraft
  ): { fieldsMatch: boolean; differences?: string[] } {
    const differences: string[] = [];

    // Compare title
    if (legacyDoc.titel !== canonicalDraft.title) {
      differences.push(`title: legacy="${legacyDoc.titel}" vs canonical="${canonicalDraft.title}"`);
    }

    // Compare URL
    if (legacyDoc.url !== canonicalDraft.canonicalUrl) {
      differences.push(`url: legacy="${legacyDoc.url}" vs canonical="${canonicalDraft.canonicalUrl}"`);
    }

    // Compare summary (legacy samenvatting vs canonical fullText excerpt)
    // Note: fullText is much longer, so we just check if samenvatting is a prefix
    if (canonicalDraft.fullText && !canonicalDraft.fullText.startsWith(legacyDoc.samenvatting || '')) {
      differences.push('summary: legacy samenvatting not found as prefix in canonical fullText');
    }

    // Compare document type
    if (legacyDoc.type_document !== canonicalDraft.documentType) {
      differences.push(`type: legacy="${legacyDoc.type_document}" vs canonical="${canonicalDraft.documentType}"`);
    }

    // Compare publication date
    const legacyDate = legacyDoc.publicatiedatum ? new Date(legacyDoc.publicatiedatum) : null;
    const canonicalDate = canonicalDraft.dates.publishedAt;
    if (legacyDate?.getTime() !== canonicalDate?.getTime()) {
      differences.push(`publishedAt: legacy="${legacyDate}" vs canonical="${canonicalDate}"`);
    }

    return {
      fieldsMatch: differences.length === 0,
      differences: differences.length > 0 ? differences : undefined,
    };
  }

  /**
   * Check if legacy write is enabled
   */
  isLegacyWriteEnabled(): boolean {
    return this.legacyWriteEnabled;
  }

  /**
   * Refresh legacy write flag from feature flags
   */
  refreshLegacyWriteFlag(): void {
    this.legacyWriteEnabled = this.featureFlags.isEnabled('MIGRATION_LEGACY_WRITE_ENABLED', true);
  }
}

// Singleton instance
let dualWriteService: DualWriteService | null = null;

/**
 * Get singleton instance of DualWriteService
 */
export function getDualWriteService(): DualWriteService {
  if (!dualWriteService) {
    dualWriteService = new DualWriteService();
  }
  return dualWriteService;
}

