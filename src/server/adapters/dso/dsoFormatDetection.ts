/**
 * DSO Document Format Detection
 * 
 * Pure functions for detecting document format (STOPTPOD vs TAMIMRO) from identifiers and content.
 * 
 * Rules:
 * - NL.IMRO.* → TAMIMRO (legacy bestemmingsplannen, GML format)
 * - /akn/... → STOPTPOD (new Omgevingswet documents, ZIP format)
 * - Other → STOPTPOD (treated as AKN for download, ZIP format)
 */

export type DsoDocumentFormat = 'STOPTPOD' | 'TAMIMRO' | 'UNKNOWN';

export interface DsoDocumentFormatInfo {
  format: DsoDocumentFormat;
  identifierType: 'AKN' | 'IMRO' | 'OTHER';
  reason: string;
}

/**
 * Detect document format from identifier
 * 
 * @param identificatie - Document identifier
 * @returns Format information
 */
export function detectFormatFromIdentifier(identificatie: string): DsoDocumentFormatInfo {
  if (identificatie.startsWith('NL.IMRO.')) {
    return {
      format: 'TAMIMRO',
      identifierType: 'IMRO',
      reason: 'IMRO identifier format (legacy bestemmingsplannen)',
    };
  }
  
  if (identificatie.startsWith('/akn/')) {
    return {
      format: 'STOPTPOD',
      identifierType: 'AKN',
      reason: 'AKN identifier format (new Omgevingswet documents)',
    };
  }
  
  // Not AKN and not IMRO → treated as STOPTPOD (will be converted to AKN for download)
  return {
    format: 'STOPTPOD',
    identifierType: 'OTHER',
    reason: 'Non-AKN, non-IMRO identifier (treated as STOPTPOD, will convert to AKN for download)',
  };
}

/**
 * Detect document format from content (ZIP vs GML)
 * 
 * @param buffer - Document content buffer
 * @returns Detected format
 */
export function detectFormatFromContent(buffer: Buffer): DsoDocumentFormat {
  // Check if buffer is GML (IMRO/TAMIMRO)
  const start = buffer.toString('utf-8', 0, Math.min(500, buffer.length));
  if (start.includes('<imro:FeatureCollectionIMRO') || 
      start.includes('FeatureCollectionIMRO') ||
      start.includes('xmlns:imro') ||
      start.includes('IMRO2008') ||
      start.includes('IMRO2006')) {
    return 'TAMIMRO';
  }
  
  // Check if buffer is ZIP (STOPTPOD)
  // ZIP files start with PK (0x504B)
  if (buffer.length >= 2 && buffer.toString('hex', 0, 2) === '504b') {
    return 'STOPTPOD';
  }
  
  return 'UNKNOWN';
}
