/**
 * ETL Extraction Service
 * 
 * Extracts canonical documents, chunks, and extensions from MongoDB/PostGIS
 * for ETL pipeline processing.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/12-etl-graphdb.md
 */

import { logger } from '../../utils/logger.js';
import { CanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { CanonicalChunkService } from '../canonical/CanonicalChunkService.js';
import { GeoExtensionService } from '../extensions/GeoExtensionService.js';
import { LegalExtensionService } from '../extensions/LegalExtensionService.js';
import { WebExtensionService } from '../extensions/WebExtensionService.js';
import { GeoIndexService } from '../../geo/GeoIndexService.js';
import { getPostgresPool } from '../../config/postgres.js';
import type { ETLJobRequest } from '../../contracts/etlContracts.js';
import type { CanonicalDocument } from '../../contracts/types.js';

/**
 * Extracted document with extensions and chunks
 */
export interface ExtractedDocument {
  document: CanonicalDocument;
  chunks?: Array<{
    chunkId: string;
    chunkIndex: number;
    text: string;
    offsets: { start: number; end: number };
    headingPath?: string[];
  }>;
  geoExtension?: {
    crsSource: string;
    crsStored: string;
    geometriesWgs84: unknown[];
    bboxWgs84: [number, number, number, number];
    geometryHash: string;
    sources: string[];
  };
  legalExtension?: {
    legalIds: string[];
    citations: string[];
    references?: string[];
    structure?: Record<string, unknown>;
  };
  webExtension?: {
    url: string;
    crawl: {
      fetchedAt: Date;
      statusCode: number;
      contentType: string;
      etag?: string;
      lastModified?: Date;
    };
    linkGraph?: {
      discoveredLinks: string[];
    };
    snapshotArtifactRef?: string;
  };
  postgisGeometry?: {
    geom: string; // WKT or GeoJSON
    bbox: [number, number, number, number];
  };
}

/**
 * ETL Extraction Service
 */
export class ETLExtractionService {
  private documentService: CanonicalDocumentService;
  private chunkService: CanonicalChunkService;
  private geoExtensionService: GeoExtensionService;
  private legalExtensionService: LegalExtensionService;
  private webExtensionService: WebExtensionService;
  private _geoIndexService: GeoIndexService;

  constructor() {
    this.documentService = new CanonicalDocumentService();
    this.chunkService = new CanonicalChunkService();
    this.geoExtensionService = new GeoExtensionService();
    this.legalExtensionService = new LegalExtensionService();
    this.webExtensionService = new WebExtensionService();
    this._geoIndexService = new GeoIndexService();
  }

  /**
   * Extract documents based on ETL job request
   */
  async extractDocuments(request: ETLJobRequest): Promise<ExtractedDocument[]> {
    const { input } = request;
    const documents: ExtractedDocument[] = [];

    // Get document IDs or query
    let documentIds: string[] = [];
    
    if (input.documentIds && input.documentIds.length > 0) {
      documentIds = input.documentIds;
    } else if (input.query) {
      // Query documents based on filters
      const documents = await this.documentService.findByQuery(
        input.query as any,
        { limit: 10000, skip: 0 } // Large limit for ETL
      );
      documentIds = documents.map((doc: CanonicalDocument) => doc._id);
    } else {
      throw new Error('ETL job request must specify either documentIds or query');
    }

    logger.info({ count: documentIds.length }, 'Extracting documents for ETL');

    // Extract each document with extensions
    for (const documentId of documentIds) {
      try {
        const extracted = await this.extractDocument(documentId, input);
        documents.push(extracted);
      } catch (error) {
        logger.error(
          { documentId, error: error instanceof Error ? error.message : String(error) },
          'Failed to extract document for ETL'
        );
        // Continue with next document
      }
    }

    return documents;
  }

  /**
   * Extract a single document with extensions and chunks
   */
  private async extractDocument(
    documentId: string,
    input: ETLJobRequest['input']
  ): Promise<ExtractedDocument> {
    // Get document
    const document = await this.documentService.findById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const extracted: ExtractedDocument = { document };

    // Get chunks if requested
    if (input.includeChunks) {
      const chunks = await this.chunkService.findChunks(documentId, { limit: 10000, skip: 0 });
      extracted.chunks = chunks.map((chunk: { chunkId: string; chunkIndex: number; text: string; offsets: { start: number; end: number }; headingPath?: string[] }) => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        offsets: chunk.offsets,
        headingPath: chunk.headingPath,
      }));
    }

    // Get extensions if requested
    if (input.includeExtensions.geo) {
      const geoExt = await this.geoExtensionService.get(documentId);
      if (geoExt) {
        // Convert crsStored from Literal to string
        extracted.geoExtension = {
          ...geoExt,
          crsStored: String(geoExt.crsStored),
        };
      }

      // Get PostGIS geometry if requested
      if (input.geoSource === 'postgis' || input.geoSource === 'both') {
        try {
          const postgisGeom = await this.getPostGISGeometry(documentId);
          if (postgisGeom) {
            extracted.postgisGeometry = postgisGeom;
          }
        } catch (error) {
          logger.warn({ documentId, error }, 'Failed to load PostGIS geometry');
        }
      }
    }

    if (input.includeExtensions.legal) {
      const legalExt = await this.legalExtensionService.get(documentId);
      if (legalExt) {
        extracted.legalExtension = legalExt;
      }
    }

    if (input.includeExtensions.web) {
      const webExt = await this.webExtensionService.get(documentId);
      if (webExt) {
        extracted.webExtension = webExt;
      }
    }

    return extracted;
  }

  /**
   * Serialize extracted documents to JSON for Python transformer
   */
  serializeDocuments(documents: ExtractedDocument[]): string {
    // Convert to plain objects, handling Date objects
    const serialized = documents.map(doc => ({
      ...doc,
      document: {
        ...doc.document,
        createdAt: doc.document.createdAt.toISOString(),
        updatedAt: doc.document.updatedAt.toISOString(),
        dates: {
          ...doc.document.dates,
          publishedAt: doc.document.dates.publishedAt?.toISOString(),
          validFrom: doc.document.dates.validFrom?.toISOString(),
          validTo: doc.document.dates.validTo?.toISOString(),
        },
      },
      geoExtension: doc.geoExtension ? {
        ...doc.geoExtension,
      } : undefined,
      legalExtension: doc.legalExtension,
      webExtension: doc.webExtension ? {
        ...doc.webExtension,
        crawl: {
          ...doc.webExtension.crawl,
          fetchedAt: doc.webExtension.crawl.fetchedAt.toISOString(),
          lastModified: doc.webExtension.crawl.lastModified?.toISOString(),
        },
      } : undefined,
    }));

    return JSON.stringify(serialized, null, 2);
  }

  /**
   * Get PostGIS geometry for a document
   */
  private async getPostGISGeometry(documentId: string): Promise<{
    geom: string; // WKT format
    bbox: [number, number, number, number];
  } | null> {
    const pool = getPostgresPool();
    
    try {
      const result = await pool.query(
        `SELECT 
          ST_AsText(geom) as geom_wkt,
          bbox
        FROM geo.document_geometries
        WHERE document_id = $1`,
        [documentId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      const bbox = row.bbox;
      
      // Parse bbox from PostGIS BOX2D format: "BOX(minLon minLat, maxLon maxLat)"
      const bboxMatch = bbox?.match(/BOX\(([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)\)/);
      const bboxArray: [number, number, number, number] = bboxMatch
        ? [parseFloat(bboxMatch[1]), parseFloat(bboxMatch[2]), parseFloat(bboxMatch[3]), parseFloat(bboxMatch[4])]
        : [0, 0, 0, 0];
      
      return {
        geom: row.geom_wkt,
        bbox: bboxArray,
      };
    } catch (error) {
      logger.error({ documentId, error }, 'Failed to query PostGIS geometry');
      throw error;
    }
  }
}

