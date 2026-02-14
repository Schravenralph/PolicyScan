/**
 * Canonical Document Utility Functions
 * 
 * Centralized utilities for working with CanonicalDocument objects.
 * These utilities provide consistent handling of canonical document data.
 * 
 * @see documentUtils.ts - Legacy utilities for BronDocument
 * @see WI-412: Frontend API Service Migration
 */

import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';

/**
 * Union type for CanonicalDocument and LightweightDocument
 * Allows utilities to work with both full and lightweight documents
 */
export type DocumentLike = CanonicalDocument | LightweightDocument;

/**
 * Gets the display title for a canonical document
 * Falls back to sourceId if title is not available
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Display title
 */
export const getCanonicalDocumentTitle = (doc: DocumentLike): string => {
  return ((doc as CanonicalDocument).title as string) || ((doc as CanonicalDocument).sourceId as string) || 'Untitled Document';
};

/**
 * Gets the display URL for a canonical document
 * Prefers canonicalUrl, falls back to first artifact URL, then sourceId
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Display URL or null
 */
export const getCanonicalDocumentUrl = (doc: DocumentLike): string | null => {
  const canonicalUrl = (doc as CanonicalDocument).canonicalUrl as string | undefined;
  if (canonicalUrl) return canonicalUrl;
  
  // Try to get URL from first artifact
  const artifactRefs = (doc as CanonicalDocument).artifactRefs as any[] | undefined;
  if (artifactRefs && artifactRefs.length > 0) {
    const firstArtifact = artifactRefs[0];
    if (firstArtifact.provenance?.url) {
      return firstArtifact.provenance.url;
    }
  }
  
  // Fallback to sourceId if it looks like a URL
  const sourceId = (doc as CanonicalDocument).sourceId as string | undefined;
  if (sourceId && (sourceId.startsWith('http://') || sourceId.startsWith('https://'))) {
    return sourceId;
  }
  
  return null;
};

/**
 * Checks if a canonical document has been reviewed (approved or rejected)
 * Uses enrichmentMetadata.accepted field if available
 * 
 * @param doc - The CanonicalDocument or LightweightDocument to check
 * @returns true if the document has been approved or rejected
 */
export const isCanonicalDocumentReviewed = (doc: DocumentLike): boolean => {
  const accepted = (doc as CanonicalDocument).enrichmentMetadata?.accepted;
  return accepted === true || accepted === false;
};

/**
 * Gets the review status for a canonical document
 * Uses reviewStatus field if available, falls back to enrichmentMetadata.accepted for backward compatibility
 * 
 * @param doc - The CanonicalDocument or LightweightDocument to get status for
 * @returns 'approved' | 'rejected' | 'needs_revision' | 'pending'
 */
export const getCanonicalDocumentStatus = (
  doc: DocumentLike
): 'approved' | 'rejected' | 'needs_revision' | 'pending' => {
  // Prefer reviewStatus field (new system)
  if ((doc as CanonicalDocument).reviewStatus) {
    if ((doc as CanonicalDocument).reviewStatus === 'pending_review') return 'pending';
    if ((doc as CanonicalDocument).reviewStatus === 'needs_revision') return 'needs_revision';
    return (doc as CanonicalDocument).reviewStatus as 'approved' | 'rejected';
  }
  
  // Fallback to enrichmentMetadata.accepted (backward compatibility)
  const accepted = (doc as CanonicalDocument).enrichmentMetadata?.accepted;
  if (accepted === true) return 'approved';
  if (accepted === false) return 'rejected';
  return 'pending';
};

/**
 * Gets the acceptance status (for filtering)
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns boolean | null (true = approved, false = rejected, null = pending)
 */
export const getCanonicalDocumentAcceptance = (
  doc: DocumentLike
): boolean | null => {
  const accepted = (doc as CanonicalDocument).enrichmentMetadata?.accepted;
  if (accepted === true) return true;
  if (accepted === false) return false;
  return null;
};

/**
 * Formats a canonical document's publication date for display
 * 
 * @param doc - The CanonicalDocument or LightweightDocument containing the date
 * @param locale - Locale for formatting (default: 'nl-NL')
 * @returns Formatted date string or null if no date
 */
export const formatCanonicalDocumentDate = (
  doc: DocumentLike,
  locale: string = 'nl-NL'
): string | null => {
  const publishedAt = (doc as CanonicalDocument).dates?.publishedAt;
  if (!publishedAt) return null;
  
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return null;
  
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Gets the document type for display
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Document type string
 */
export const getCanonicalDocumentType = (doc: DocumentLike): string => {
  return ((doc as CanonicalDocument).documentType as string) || ((doc as CanonicalDocument).documentFamily as string) || 'Unknown';
};

/**
 * Gets the source name for display
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Source name
 */
export const getCanonicalDocumentSource = (doc: DocumentLike): string => {
  return ((doc as CanonicalDocument).source as string) || 'Unknown';
};

/**
 * Checks if document has full text content (or preview)
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns true if document has full text or preview
 */
export const hasCanonicalDocumentFullText = (doc: DocumentLike): boolean => {
  if ('fullText' in doc && (doc as CanonicalDocument).fullText && (doc as CanonicalDocument).fullText.trim().length > 0) {
    return true;
  }
  if ('fullTextPreview' in doc && (doc as LightweightDocument).fullTextPreview && (doc as LightweightDocument).fullTextPreview!.trim().length > 0) {
    return true;
  }
  return false;
};

/**
 * Gets a preview of the document text
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @param maxLength - Maximum length of preview (default: 200)
 * @returns Preview text
 */
export const getCanonicalDocumentPreview = (
  doc: DocumentLike,
  maxLength: number = 200
): string => {
  let text = '';
  
  if ('fullText' in doc && (doc as CanonicalDocument).fullText) {
    text = (doc as CanonicalDocument).fullText;
  } else if ('fullTextPreview' in doc && (doc as LightweightDocument).fullTextPreview) {
    text = (doc as LightweightDocument).fullTextPreview || '';
  }

  if (!text) return '';

  text = text.trim();
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength) + '...';
};

/**
 * Gets the document ID from a CanonicalDocument or LightweightDocument
 * Prefers _id if available (persisted document), falls back to sourceId
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @returns Document ID or undefined
 */
export const getCanonicalDocumentId = (doc: DocumentLike): string | undefined => {
  // Check for _id first (persisted documents)
  const id = (doc as CanonicalDocument)._id as string | undefined;
  if (id) {
    return id;
  }
  // Fallback to sourceId
  return (doc as CanonicalDocument).sourceId as string | undefined;
};

/**
 * Filters out technical content from document text
 * Removes URLs, schema references, technical identifiers, coordinates, etc.
 * 
 * @param text - Text to filter
 * @returns Filtered text
 */
const filterTechnicalContent = (text: string): string => {
  // Split into lines for easier processing
  const lines = text.split('\n');
  const filteredLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) {
      continue;
    }
    
    // Filter out URLs
    if (/^https?:\/\//.test(trimmed)) {
      continue;
    }
    
    // Filter out schema references
    if (/^http:\/\/schemas\.geonovum\.nl\//.test(trimmed) || 
        /^http:\/\/www\.geonovum\.nl\//.test(trimmed)) {
      continue;
    }
    
    // Filter out "Collectie" lines with technical metadata
    if (/^Collectie\s+http/.test(trimmed)) {
      continue;
    }
    
    // Filter out technical identifiers
    if (/^NL\.IMRO\./.test(trimmed)) {
      continue;
    }
    
    // Filter out namespace declarations
    if (/^xmlns:/.test(trimmed)) {
      continue;
    }
    
    // Filter out CRS/coordinate system references
    if (/^urn:ogc:def:crs:EPSG:/.test(trimmed)) {
      continue;
    }
    
    // Filter out "NedPlan" version strings
    if (/^NedPlan\s+[\d.]+$/i.test(trimmed)) {
      continue;
    }
    
    // Filter out pure coordinate strings (just numbers and spaces/dots)
    if (/^\d+[\s\d.]+$/.test(trimmed) && trimmed.split(/\s+/).length >= 2) {
      continue;
    }
    
    // Keep the line if it passes all filters
    filteredLines.push(line);
  }
  
  return filteredLines.join('\n');
};

/**
 * Gets a cleaned summary for a canonical document
 * Prefers doc.summary or doc.samenvatting if available
 * Falls back to filtered fullText (or preview) with technical content removed
 * 
 * @param doc - The CanonicalDocument or LightweightDocument
 * @param maxLength - Maximum length of summary (default: 200)
 * @returns Cleaned summary text
 */
export const getCanonicalDocumentSummary = (
  doc: DocumentLike,
  maxLength: number = 200
): string => {
  // Prefer explicit summary fields
  const summary = (doc as any).summary as string | undefined;
  if (summary && typeof summary === 'string' && summary.trim()) {
    const trimmed = summary.trim();
    return trimmed.length > maxLength ? trimmed.substring(0, maxLength) + '...' : trimmed;
  }
  
  const samenvatting = (doc as any).samenvatting as string | undefined;
  if (samenvatting && typeof samenvatting === 'string' && samenvatting.trim()) {
    const trimmed = samenvatting.trim();
    return trimmed.length > maxLength ? trimmed.substring(0, maxLength) + '...' : trimmed;
  }
  
  // Fall back to fullText or fullTextPreview, but filter out technical content
  let textToProcess = '';
  if ('fullText' in doc && (doc as CanonicalDocument).fullText) {
    textToProcess = (doc as CanonicalDocument).fullText;
  } else if ('fullTextPreview' in doc && (doc as LightweightDocument).fullTextPreview) {
    textToProcess = (doc as LightweightDocument).fullTextPreview || '';
  }

  if (textToProcess && typeof textToProcess === 'string') {
    // Filter technical content
    let cleanedText = filterTechnicalContent(textToProcess);
    
    // Skip leading whitespace/newlines
    cleanedText = cleanedText.trim();
    
    // Find first meaningful paragraph (non-empty line with actual content)
    const lines = cleanedText.split('\n');
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip empty lines and very short lines (likely still technical)
      if (line && line.length > 10) {
        startIndex = i;
        break;
      }
    }
    
    // Extract from first meaningful content
    const meaningfulText = lines.slice(startIndex).join('\n').trim();
    
    if (!meaningfulText) {
      return '';
    }
    
    // Return first maxLength characters of meaningful content
    if (meaningfulText.length <= maxLength) {
      return meaningfulText;
    }
    
    // Try to break at word boundary
    const truncated = meaningfulText.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }
  
  // Fallback to content field if available
  if ((doc as CanonicalDocument).content && typeof (doc as CanonicalDocument).content === 'string') {
    const content = filterTechnicalContent((doc as CanonicalDocument).content as string).trim();
    if (content) {
      return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
    }
  }
  
  return '';
};