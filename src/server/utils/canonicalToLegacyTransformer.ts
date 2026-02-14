/**
 * CanonicalToLegacyTransformer
 * 
 * ⚠️ **DEPRECATED** - This transformation utility is deprecated.
 * 
 * Transforms CanonicalDocument to BronDocumentDocument format for API compatibility.
 * This transformation layer is being removed as part of the canonical document migration.
 * 
 * **Migration:**
 * - Use `CanonicalDocument` directly instead of transforming to legacy format
 * - Update callers to work with canonical format
 * - See WI-415: Backend Cleanup & Transformation Removal
 * 
 * @deprecated Use CanonicalDocument directly instead of transforming to legacy format
 * @see WI-415: Backend Cleanup & Transformation Removal
 */

import { ObjectId } from 'mongodb';
import type { CanonicalDocument } from '../contracts/types.js';
import type { BronDocumentDocument } from '../types/index.js';

/**
 * Transform a CanonicalDocument to the legacy BronDocument format
 * 
 * @deprecated This transformer is deprecated. Use CanonicalDocument directly.
 * Will be removed in a future release.
 * 
 * @param canonicalDoc The canonical document to transform
 * @returns The legacy BronDocument representation
 */
export function transformCanonicalToLegacy(canonicalDoc: CanonicalDocument): BronDocumentDocument {
  const enrichment = canonicalDoc.enrichmentMetadata || {};
  const sourceMetadata = canonicalDoc.sourceMetadata || {};

  // Extract legacy fields from sourceMetadata and enrichmentMetadata
  const legacyUrl = sourceMetadata.legacyUrl as string | undefined;
  const legacyWebsiteUrl = sourceMetadata.legacyWebsiteUrl as string | undefined;
  const legacyLabel = sourceMetadata.legacyLabel as string | undefined;
  const legacySource = sourceMetadata.legacySource as string | undefined;
  const legacyQueryId = sourceMetadata.legacyQueryId as string | undefined;
  const legacyWorkflowRunId = sourceMetadata.legacyWorkflowRunId as string | undefined;
  const legacyWorkflowId = sourceMetadata.legacyWorkflowId as string | undefined;
  const legacyStepId = sourceMetadata.legacyStepId as string | undefined;
  const legacyDiscoveredAt = sourceMetadata.legacyDiscoveredAt as Date | undefined;
  const legacySubjects = sourceMetadata.legacySubjects as string[] | undefined;
  const legacyThemes = sourceMetadata.legacyThemes as string[] | undefined;
  const legacyAccepted = sourceMetadata.legacyAccepted as boolean | null | undefined;
  const legacyContentHash = enrichment.legacyContentHash as string | undefined;
  const legacyLastContentChange = enrichment.legacyLastContentChange as Date | undefined;
  const legacyMetadataConfidence = enrichment.legacyMetadataConfidence as number | undefined;
  const legacyDocumentStatus = enrichment.legacyDocumentStatus as string | null | undefined;

  // Extract summary from fullText (first paragraph or first 500 chars)
  const fullText = canonicalDoc.fullText || '';
  const firstParagraph = fullText.split('\n\n')[0];
  const samenvatting = firstParagraph
    ? (firstParagraph.length > 500 ? firstParagraph.substring(0, 500) : firstParagraph)
    : (fullText.length > 500 ? fullText.substring(0, 500) : fullText);

  // Build BronDocumentDocument
  // Ensure titel is always set (required field)
  // Use title from canonical doc, or fallback to sourceId or a default
  const titel = canonicalDoc.title ||
    (sourceMetadata.legacyTitel as string | undefined) ||
    canonicalDoc.sourceId ||
    'Untitled Document';

  const bronDoc: BronDocumentDocument = {
    _id: new ObjectId(canonicalDoc._id),
    titel,
    url: canonicalDoc.canonicalUrl || legacyUrl || '',
    website_url: legacyWebsiteUrl || canonicalDoc.canonicalUrl || '',
    website_titel: (sourceMetadata.legacyWebsiteTitel as string | undefined) || undefined,
    label: legacyLabel || canonicalDoc.source.toLowerCase(),
    samenvatting,
    'relevantie voor zoekopdracht': '', // Not available in canonical model
    type_document: canonicalDoc.documentType,
    publicatiedatum: canonicalDoc.dates.publishedAt?.toISOString() || null,
    subjects: legacySubjects || [],
    themes: legacyThemes || [],
    accepted: legacyAccepted ?? null,
    queryId: legacyQueryId ? new ObjectId(legacyQueryId) : (enrichment.queryId ? new ObjectId(enrichment.queryId as string) : undefined),
    workflowRunId: legacyWorkflowRunId ? new ObjectId(legacyWorkflowRunId) : (enrichment.workflowRunId ? new ObjectId(enrichment.workflowRunId as string) : undefined),
    workflowId: legacyWorkflowId || (enrichment.workflowId as string | undefined),
    stepId: legacyStepId || (enrichment.stepId as string | undefined),
    source: legacySource || canonicalDoc.source.toLowerCase(),
    discoveredAt: legacyDiscoveredAt || canonicalDoc.createdAt,
    issuingAuthority: canonicalDoc.publisherAuthority || null,
    documentStatus: legacyDocumentStatus || null,
    metadataConfidence: legacyMetadataConfidence,
    contentHash: legacyContentHash,
    lastContentChange: legacyLastContentChange,
    createdAt: canonicalDoc.createdAt,
    updatedAt: canonicalDoc.updatedAt,
  };

  return bronDoc;
}

/**
 * Transform array of CanonicalDocument to BronDocumentDocument[]
 * 
 * @param canonicalDocs - Array of canonical documents
 * @returns Array of BronDocumentDocument format
 */
export function transformCanonicalArrayToLegacy(canonicalDocs: CanonicalDocument[]): BronDocumentDocument[] {
  return canonicalDocs.map(transformCanonicalToLegacy);
}

