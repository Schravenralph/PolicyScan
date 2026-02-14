import { ScrapedDocument, DocumentType } from '../../infrastructure/types.js';

/**
 * Service for extracting document type from documents
 * 
 * Uses pattern matching on:
 * - URL patterns
 * - Title patterns
 * - Content keywords
 */
export class DocumentTypeExtractor {
  /**
   * Extract document type from document
   */
  extractType(document: ScrapedDocument): DocumentType | null {
    // Check URL first (most reliable)
    const urlType = this.extractFromUrl(document.url);
    if (urlType) {
      return urlType;
    }

    // Check title
    const titleType = this.extractFromTitle(document.titel);
    if (titleType) {
      return titleType;
    }

    // Check summary/content
    const contentType = this.extractFromContent(document.samenvatting);
    if (contentType) {
      return contentType;
    }

    return null;
  }

  /**
   * Extract type from URL
   */
  private extractFromUrl(url: string): DocumentType | null {
    const urlLower = url.toLowerCase();

    // PDF files
    if (urlLower.endsWith('.pdf')) {
      return 'PDF';
    }

    // URL patterns
    if (urlLower.includes('omgevingsvisie') || urlLower.includes('omgevings-visie')) {
      return 'Omgevingsvisie';
    }
    if (urlLower.includes('omgevingsplan') || urlLower.includes('omgevings-plan')) {
      return 'Omgevingsplan';
    }
    if (urlLower.includes('bestemmingsplan')) {
      return 'Bestemmingsplan';
    }
    if (urlLower.includes('structuurvisie')) {
      return 'Structuurvisie';
    }
    if (urlLower.includes('beleidsregel')) {
      return 'Beleidsregel';
    }
    if (urlLower.includes('beleidsnota') || urlLower.includes('beleids-nota')) {
      return 'Beleidsnota';
    }
    if (urlLower.includes('verordening')) {
      return 'Verordening';
    }
    if (urlLower.includes('visiedocument')) {
      return 'Visiedocument';
    }
    if (urlLower.includes('rapport')) {
      return 'Rapport';
    }
    if (urlLower.includes('besluit')) {
      return 'Besluit';
    }

    return null;
  }

  /**
   * Extract type from title
   */
  private extractFromTitle(title: string): DocumentType | null {
    const titleLower = title.toLowerCase();

    // Policy documents
    if (titleLower.includes('omgevingsvisie')) {
      return 'Omgevingsvisie';
    }
    if (titleLower.includes('omgevingsplan')) {
      return 'Omgevingsplan';
    }
    if (titleLower.includes('bestemmingsplan')) {
      return 'Bestemmingsplan';
    }
    if (titleLower.includes('structuurvisie')) {
      return 'Structuurvisie';
    }
    if (titleLower.includes('beleidsregel')) {
      return 'Beleidsregel';
    }
    if (titleLower.includes('beleidsnota')) {
      return 'Beleidsnota';
    }
    if (titleLower.includes('verordening')) {
      return 'Verordening';
    }
    if (titleLower.includes('visiedocument') || titleLower.includes('visie document')) {
      return 'Visiedocument';
    }
    if (titleLower.includes('rapport')) {
      return 'Rapport';
    }
    if (titleLower.includes('besluit')) {
      return 'Besluit';
    }
    if (titleLower.includes('beleid') && !titleLower.includes('beleidsnota') && !titleLower.includes('beleidsregel')) {
      return 'Beleidsdocument';
    }

    return null;
  }

  /**
   * Extract type from content
   */
  private extractFromContent(content: string): DocumentType | null {
    const contentLower = content.toLowerCase();

    // Look for keywords that indicate document type
    if (contentLower.includes('omgevingsvisie')) {
      return 'Omgevingsvisie';
    }
    if (contentLower.includes('omgevingsplan')) {
      return 'Omgevingsplan';
    }
    if (contentLower.includes('bestemmingsplan')) {
      return 'Bestemmingsplan';
    }
    if (contentLower.includes('structuurvisie')) {
      return 'Structuurvisie';
    }
    if (contentLower.includes('beleidsregel')) {
      return 'Beleidsregel';
    }
    if (contentLower.includes('beleidsnota')) {
      return 'Beleidsnota';
    }
    if (contentLower.includes('verordening')) {
      return 'Verordening';
    }
    if (contentLower.includes('visiedocument')) {
      return 'Visiedocument';
    }
    if (contentLower.includes('rapport')) {
      return 'Rapport';
    }
    if (contentLower.includes('besluit')) {
      return 'Besluit';
    }
    if (contentLower.includes('beleidsdocument')) {
      return 'Beleidsdocument';
    }

    return null;
  }
}

