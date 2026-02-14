/**
 * Export Validation - Validates data before export
 * 
 * Provides utilities for validating export data, formats, and browser capabilities
 * to prevent export failures.
 */

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedSize?: number;
  willFitInMemory?: boolean;
}

export type ExportFormat = 'csv' | 'json' | 'markdown' | 'xlsx' | 'tsv' | 'html' | 'xml' | 'pdf';

/**
 * Maximum recommended document count for client-side export
 */
const MAX_CLIENT_EXPORT_DOCUMENTS = 1000;

/**
 * Maximum recommended file size for direct download (10MB)
 */
const MAX_DIRECT_DOWNLOAD_SIZE = 10 * 1024 * 1024;

/**
 * Validate export data before export
 */
export function validateExportData(
  documents: unknown[],
  format: ExportFormat
): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if documents is an array
  if (!Array.isArray(documents)) {
    errors.push('Documents must be an array');
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  // Check if documents array is empty
  if (documents.length === 0) {
    errors.push('No documents to export');
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  // Check document count for client-side export
  if (documents.length > MAX_CLIENT_EXPORT_DOCUMENTS) {
    warnings.push(
      `Large dataset (${documents.length} documents). Consider using server-side export for better performance.`
    );
  }

  // Estimate export size
  const estimatedSize = estimateExportSize(documents, format);
  if (estimatedSize > MAX_DIRECT_DOWNLOAD_SIZE) {
    warnings.push(
      `Large export size (${formatBytes(estimatedSize)}). Consider using server-side export.`
    );
  }

  // Check if browser supports the format
  const browserSupport = checkBrowserSupport(format);
  if (!browserSupport.supported) {
    errors.push(`Browser does not support ${format} export: ${browserSupport.reason}`);
  }

  // Validate document structure
  const invalidDocuments = documents.filter((doc) => {
    if (!doc || typeof doc !== 'object') {
      return true;
    }
    // Basic structure check - documents should have at least an id or url
    const d = doc as Record<string, unknown>;
    return !d.id && !d._id && !d.url;
  });

  if (invalidDocuments.length > 0) {
    warnings.push(`${invalidDocuments.length} document(s) have invalid structure`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedSize,
    willFitInMemory: estimatedSize < MAX_DIRECT_DOWNLOAD_SIZE,
  };
}

/**
 * Estimate export size in bytes
 */
function estimateExportSize(documents: unknown[], format: ExportFormat): number {
  // Rough estimation based on format
  const avgDocumentSize: Record<ExportFormat, number> = {
    csv: 500, // ~500 bytes per document in CSV
    json: 2000, // ~2KB per document in JSON
    markdown: 1500, // ~1.5KB per document in Markdown
    xlsx: 3000, // ~3KB per document in XLSX
    tsv: 500, // ~500 bytes per document in TSV
    html: 2500, // ~2.5KB per document in HTML
    xml: 2000, // ~2KB per document in XML
    pdf: 50000, // ~50KB per document in PDF (larger)
  };

  const avgSize = avgDocumentSize[format] || 2000;
  return documents.length * avgSize;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check browser support for export format
 */
function checkBrowserSupport(format: ExportFormat): {
  supported: boolean;
  reason?: string;
} {
  // All formats are generally supported in modern browsers
  // PDF requires additional libraries (jsPDF, etc.)
  if (format === 'pdf') {
    // Check if PDF generation libraries are available
    // This is a basic check - actual implementation may vary
    return {
      supported: true, // Assume supported if exportUtils handles it
    };
  }

  // XLSX requires SheetJS library
  if (format === 'xlsx') {
    return {
      supported: true, // Assume supported if exportUtils handles it
    };
  }

  // All other formats are natively supported
  return {
    supported: true,
  };
}

/**
 * Validate export format
 */
export function validateExportFormat(format: unknown): format is ExportFormat {
  const validFormats: ExportFormat[] = [
    'csv',
    'json',
    'markdown',
    'xlsx',
    'tsv',
    'html',
    'xml',
    'pdf',
  ];
  return typeof format === 'string' && validFormats.includes(format as ExportFormat);
}

/**
 * Check if export should use server-side processing
 */
export function shouldUseServerSideExport(
  documents: unknown[],
  format: ExportFormat
): boolean {
  const validation = validateExportData(documents, format);
  
  // Use server-side if:
  // - Too many documents
  // - Estimated size too large
  // - Format requires server processing (PDF, XLSX for very large datasets)
  return (
    documents.length > MAX_CLIENT_EXPORT_DOCUMENTS ||
    (validation.estimatedSize && validation.estimatedSize > MAX_DIRECT_DOWNLOAD_SIZE) ||
    (format === 'pdf' && documents.length > 500) ||
    (format === 'xlsx' && documents.length > 1000)
  );
}


