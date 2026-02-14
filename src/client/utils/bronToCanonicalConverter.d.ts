/**
 * Bron to Canonical Converter
 *
 * Helper functions to convert BronDocument (legacy frontend format) to CanonicalDocumentDraft.
 * Used for migrating frontend create operations to use canonical document API.
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import type { BronDocument } from './transformations';
import type { CanonicalDocumentDraft } from '../services/api';
/**
 * Convert BronDocument to CanonicalDocumentDraft
 *
 * Converts legacy frontend format to canonical format for API creation.
 * Handles all legacy fields and maps them to canonical structure.
 *
 * @param bronDoc - Legacy document from frontend
 * @returns Canonical document draft for API
 */
export declare function convertBronToCanonicalDraft(bronDoc: BronDocument): Promise<CanonicalDocumentDraft>;
