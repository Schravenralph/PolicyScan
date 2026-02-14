import { Readable } from 'stream';
import type { ExportDocument, ExportOptions } from '../ExportService.js';

/**
 * Format generator interface for export abstraction
 */
export interface FormatGenerator {
    /**
     * Generate export content
     * @param documents Documents to export
     * @param options Export options
     * @returns Export content (string for text formats, Readable stream for binary formats)
     */
    generate(documents: ExportDocument[], options?: ExportOptions): string | Readable;
    
    /**
     * Get MIME type for the format
     */
    getMimeType(): string;
    
    /**
     * Get file extension for the format
     */
    getExtension(): string;
}

