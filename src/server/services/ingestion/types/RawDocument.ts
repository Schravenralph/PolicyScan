/**
 * Raw Document Type
 * 
 * Represents a raw document as it comes from a source adapter.
 * This is the output of adapters and input to normalization.
 */

export interface RawDocument {
  /** Unique identifier */
  id: string;
  /** URL of the document */
  url: string;
  /** Document title (optional) */
  title?: string;
  /** Document content (optional) */
  content?: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}
