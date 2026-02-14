/**
 * Citation - Legal or document citation extracted from text
 * 
 * Represents a citation to another legal document, regulation, or policy.
 */

/**
 * Citation extracted from document text
 */
export interface Citation {
  /** Unique identifier for the citation */
  id: string;
  /** Citation text as found in document */
  text: string;
  /** Citation type (e.g., 'wet', 'besluit', 'verordening', 'artikel') */
  type?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source document identifier */
  sourceDocument: string;
  /** Timestamp when citation was extracted */
  extractedAt: Date;
}
