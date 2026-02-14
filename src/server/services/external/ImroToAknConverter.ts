/**
 * IMRO to AKN Converter Service
 * 
 * Converts IMRO identifiers (e.g., "NL.IMRO.0453.OM0001KUNSTOBJECT1-R001")
 * to AKN format (e.g., "/akn/nl/act/gm0453/2022/omgevingsplan")
 * 
 * The DSO Download API requires AKN format, but the Discovery API returns IMRO format.
 * This service bridges that gap.
 */

import { logger } from '../../utils/logger.js';

export interface ConversionResult {
  success: boolean;
  aknIdentifier?: string;
  error?: string;
  method?: 'direct' | 'parsed' | 'fallback';
}

/**
 * Service for converting IMRO identifiers to AKN format
 */
export class ImroToAknConverter {
  /**
   * Convert IMRO identifier to AKN format
   * 
   * @param imroIdentifier - IMRO identifier (e.g., "NL.IMRO.0453.OM0001KUNSTOBJECT1-R001")
   * @param documentType - Optional document type from discovery (e.g., "omgevingsplan", "bestemmingsplan")
   * @param year - Optional year from discovery metadata
   * @returns Conversion result with AKN identifier or error
   */
  convertToAkn(
    imroIdentifier: string,
    documentType?: string,
    year?: string | number
  ): ConversionResult {
    // If already AKN format, return as-is
    if (imroIdentifier.startsWith('/akn/')) {
      logger.debug({ imroIdentifier }, '[ImroToAknConverter] Identifier already in AKN format');
      return {
        success: true,
        aknIdentifier: imroIdentifier,
        method: 'direct',
      };
    }

    // Validate IMRO format
    if (!imroIdentifier.startsWith('NL.IMRO.')) {
      return {
        success: false,
        error: `Invalid IMRO format: ${imroIdentifier}. Expected format: NL.IMRO.XXXXX`,
      };
    }

    try {
      // Parse IMRO identifier: NL.IMRO.{municipality_code}.{document_code}-{version}
      // Example: NL.IMRO.0453.OM0001KUNSTOBJECT1-R001
      const parts = imroIdentifier.replace('NL.IMRO.', '').split('.');
      
      if (parts.length < 2) {
        return {
          success: false,
          error: `Cannot parse IMRO identifier: ${imroIdentifier}. Expected format: NL.IMRO.{municipality}.{document}-{version}`,
        };
      }

      const municipalityCode = parts[0]; // e.g., "0453"
      const documentPart = parts[1]; // e.g., "OM0001KUNSTOBJECT1-R001"
      
      // Extract version if present (format: {document}-{version})
      const versionMatch = documentPart.match(/^(.+)-([A-Z0-9]+)$/);
      const documentCode = versionMatch ? versionMatch[1] : documentPart;
      const version = versionMatch ? versionMatch[2] : undefined;

      // Determine document type from document code or provided type
      const aknDocumentType = this.mapDocumentType(documentCode, documentType);

      // Determine year (use provided year, or extract from document code, or use current year as fallback)
      const aknYear = this.determineYear(year, documentCode);

      // Build AKN identifier: /akn/nl/act/gm{municipality_code}/{year}/{document_type}
      // Based on working examples: /akn/nl/act/gm0118/2020/omgevingsplan
      // NOTE: Version suffix (/nld@version) is NOT used in download API requests
      // The download API uses the base AKN path without version suffix
      const aknIdentifier = `/akn/nl/act/gm${municipalityCode}/${aknYear}/${aknDocumentType}`;
      
      // Do NOT add version suffix - download API doesn't use it
      // Versions are handled via query parameters, not in the regelingId path
      const finalAkn = aknIdentifier;

      logger.debug(
        {
          imroIdentifier,
          aknIdentifier: finalAkn,
          municipalityCode,
          documentCode,
          documentType: aknDocumentType,
          year: aknYear,
          version,
        },
        '[ImroToAknConverter] Converted IMRO to AKN'
      );

      return {
        success: true,
        aknIdentifier: finalAkn,
        method: 'parsed',
      };
    } catch (error) {
      logger.error(
        { error, imroIdentifier },
        '[ImroToAknConverter] Error converting IMRO to AKN'
      );
      return {
        success: false,
        error: `Conversion failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Map document code or type to AKN document type
   * 
   * Based on working AKN examples:
   * - /akn/nl/act/gm0118/2020/omgevingsplan
   * - /akn/nl/act/gm0796/2025/omgevingsvisie
   * - /akn/nl/act/gm0796/2025/voorbereidingsbesluit
   * 
   * @param documentCode - Document code from IMRO identifier
   * @param providedType - Document type from discovery metadata
   * @returns AKN document type
   */
  private mapDocumentType(documentCode: string, providedType?: string): string {
    // Use provided type if available and valid
    if (providedType) {
      const normalized = providedType.toLowerCase().replace(/\s+/g, '');
      // Common document types in AKN format
      const validTypes = [
        'omgevingsplan',
        'bestemmingsplan',
        'omgevingsvisie',
        'omgevingsprogramma',
        'omgevingsverordening',
        'projectbesluit',
        'omgevingsvergunning',
      ];
      
      if (validTypes.some(type => normalized.includes(type))) {
        if (normalized.includes('omgevingsplan')) return 'omgevingsplan';
        if (normalized.includes('bestemmingsplan')) return 'bestemmingsplan';
        if (normalized.includes('omgevingsvisie')) return 'omgevingsvisie';
        if (normalized.includes('omgevingsprogramma')) return 'omgevingsprogramma';
        if (normalized.includes('omgevingsverordening')) return 'omgevingsverordening';
        if (normalized.includes('projectbesluit')) return 'projectbesluit';
        if (normalized.includes('omgevingsvergunning')) return 'omgevingsvergunning';
      }
    }

    // Infer from document code patterns
    // OM = Omgevingsplan, BP = Bestemmingsplan, OV = Omgevingsvisie, etc.
    if (documentCode.startsWith('OM')) return 'omgevingsplan';
    if (documentCode.startsWith('BP')) return 'bestemmingsplan';
    if (documentCode.startsWith('OV')) return 'omgevingsvisie';
    if (documentCode.startsWith('OP')) return 'omgevingsprogramma';
    if (documentCode.startsWith('PP')) return 'projectbesluit';

    // Default fallback
    logger.warn(
      { documentCode, providedType },
      '[ImroToAknConverter] Unknown document type, using fallback'
    );
    return 'omgevingsplan'; // Most common type
  }

  /**
   * Determine year for AKN identifier
   * 
   * @param providedYear - Year from discovery metadata
   * @param documentCode - Document code from IMRO identifier
   * @returns Year as string
   */
  private determineYear(providedYear?: string | number, documentCode?: string): string {
    // Use provided year if available
    if (providedYear) {
      const year = typeof providedYear === 'number' ? providedYear : parseInt(String(providedYear), 10);
      if (!isNaN(year) && year > 2000 && year <= new Date().getFullYear() + 1) {
        return String(year);
      }
    }

    // Try to extract year from document code (some codes contain year)
    if (documentCode) {
      const yearMatch = documentCode.match(/(20\d{2})/);
      if (yearMatch) {
        return yearMatch[1];
      }
    }

    // Fallback to current year (most documents are recent)
    const currentYear = new Date().getFullYear();
    logger.warn(
      { providedYear, documentCode },
      '[ImroToAknConverter] Could not determine year, using current year as fallback'
    );
    return String(currentYear);
  }

  /**
   * Batch convert multiple IMRO identifiers
   * 
   * @param identifiers - Array of IMRO identifiers with optional metadata
   * @returns Array of conversion results
   */
  convertBatch(
    identifiers: Array<{
      imroIdentifier: string;
      documentType?: string;
      year?: string | number;
    }>
  ): ConversionResult[] {
    return identifiers.map(({ imroIdentifier, documentType, year }) =>
      this.convertToAkn(imroIdentifier, documentType, year)
    );
  }
}

/**
 * Singleton instance
 */
export const imroToAknConverter = new ImroToAknConverter();

