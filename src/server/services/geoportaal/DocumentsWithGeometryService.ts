/**
 * DocumentsWithGeometryService
 * 
 * Service for querying documents with geometry data for Geoportaal API.
 * Combines PostGIS spatial queries with MongoDB document queries.
 * 
 * @see docs/geoportaal-api-spec.md
 */

import { getCanonicalDocumentService } from '../canonical/CanonicalDocumentService.js';
import { GeoExtensionService } from '../extensions/GeoExtensionService.js';
import { GeoIndexService } from '../../geo/GeoIndexService.js';
import { GemeenteModel } from '../../models/Gemeente.js';
import { ObjectId } from 'mongodb';
import { logger } from '../../utils/logger.js';
import type { CanonicalDocument } from '../../contracts/types.js';
import type { GeoExtensionPayload } from '../extensions/GeoExtensionService.js';
import type { Geometry, GeometryCollection } from 'geojson';

/**
 * Filters for querying documents with geometry
 */
export interface DocumentsWithGeometryFilters {
  source?: string;
  municipalityCode?: string;
  documentType?: string;
  bbox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

/**
 * Pagination parameters
 */
export interface DocumentsWithGeometryPagination {
  limit: number;
  offset: number;
}

/**
 * Document with geometry in Geoportaal format
 */
export interface DocumentWithGeometry {
  id: string;
  title: string;
  source: string;
  documentType: string;
  municipalityCode?: string;
  geometry: Geometry | GeometryCollection;
  bbox: [number, number, number, number];
  metadata: Record<string, unknown>;
}

/**
 * Response format for documents with geometry
 */
export interface DocumentsWithGeometryResponse {
  documents: DocumentWithGeometry[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * DocumentsWithGeometryService
 */
export class DocumentsWithGeometryService {
  private documentService = getCanonicalDocumentService();
  private geoExtensionService = new GeoExtensionService();
  private geoIndexService = new GeoIndexService();

  /**
   * Find documents with geometry matching the filters
   */
  async findDocumentsWithGeometry(
    filters: DocumentsWithGeometryFilters,
    pagination: DocumentsWithGeometryPagination
  ): Promise<DocumentsWithGeometryResponse> {
    const { limit, offset } = pagination;

    try {
      // Step 1: Get document IDs based on filters
      let documentIds: string[];

      if (filters.bbox) {
        // Use PostGIS spatial query for bbox filtering
        const documentFilters: any = {};
        if (filters.source) {
          documentFilters.source = filters.source;
        }
        if (filters.documentType) {
          documentFilters.documentType = filters.documentType;
        }

        // Query PostGIS for documents within bbox
        const ids = await this.geoIndexService.queryWithin(filters.bbox, documentFilters);
        documentIds = ids.map(id => String(id));
      } else {
        // Query MongoDB directly for documents with geometry
        documentIds = await this.queryDocumentsWithGeometry(filters);
      }

      // Step 2: Apply municipality code filter if provided
      if (filters.municipalityCode && documentIds.length > 0) {
        documentIds = await this.filterByMunicipalityCode(documentIds, filters.municipalityCode);
      }

      // Step 3: Get total count before pagination
      const total = documentIds.length;

      // Step 4: Apply pagination
      const paginatedIds = documentIds.slice(offset, offset + limit);

      // Step 5: Fetch documents and their geo extensions
      const documents = await this.documentService.findByIds(paginatedIds);
      const geoExtensions = await this.loadGeoExtensions(paginatedIds);

      // Step 5b: Bulk lookup municipality codes for documents without them
      const publisherAuthorities = new Set<string>();
      for (const doc of documents) {
        if (!doc) continue;
        // Check if we can extract code synchronously
        const code = this.extractMunicipalityCode(doc);
        if (!code && doc.publisherAuthority) {
          publisherAuthorities.add(doc.publisherAuthority);
        }
      }

      const municipalityCodeMap = new Map<string, string>();
      if (publisherAuthorities.size > 0) {
        const gemeentenMap = await GemeenteModel.findByNames(Array.from(publisherAuthorities));
        for (const [name, gemeente] of gemeentenMap.entries()) {
          if (gemeente.municipalityCode) {
            municipalityCodeMap.set(name, gemeente.municipalityCode);
          }
        }
      }

      // Step 6: Transform to Geoportaal format
      const transformedDocuments = await Promise.all(
        documents.map(async (doc) => {
          if (!doc) return null;
          const geoExt = geoExtensions.get(doc._id);
          if (!geoExt) return null; // Skip documents without geometry

          return this.transformToGeoportaalFormat(doc, geoExt, municipalityCodeMap);
        })
      );

      // Filter out null documents (those without geometry)
      const validDocuments = transformedDocuments.filter(
        (doc): doc is DocumentWithGeometry => doc !== null
      );

      return {
        documents: validDocuments,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error({ error, filters, pagination }, 'Failed to find documents with geometry');
      throw error;
    }
  }

  /**
   * Query documents with geometry from MongoDB (when no bbox filter)
   */
  private async queryDocumentsWithGeometry(
    filters: DocumentsWithGeometryFilters
  ): Promise<string[]> {
    const { getDB } = await import('../../config/database.js');
    const db = getDB();
    const collection = db.collection('canonical_documents');
    const extensionsCollection = db.collection('extensions');

    // Build MongoDB filter
    const mongoFilter: any = {};
    if (filters.source) {
      mongoFilter.source = filters.source;
    }
    if (filters.documentType) {
      mongoFilter.documentType = filters.documentType;
    }

    // Find documents that have geo extensions
    const documentsWithGeo = await extensionsCollection
      .find({
        type: 'geo',
        version: 'v1',
      })
      .project({ documentId: 1 })
      .toArray();

    const documentIdsWithGeo = documentsWithGeo.map((ext: any) => ext.documentId);

    if (documentIdsWithGeo.length === 0) {
      return [];
    }

    // Filter by document IDs that have geometry
    mongoFilter._id = {
      $in: documentIdsWithGeo.map((id: string) => new ObjectId(id)),
    };

    // Query documents
    const documents = await collection
      .find(mongoFilter)
      .project({ _id: 1 })
      .toArray();

    return documents.map((doc: any) => doc._id.toString());
  }

  /**
   * Filter documents by municipality code
   */
  private async filterByMunicipalityCode(
    documentIds: string[],
    municipalityCode: string
  ): Promise<string[]> {
    const { getDB } = await import('../../config/database.js');
    const db = getDB();
    const collection = db.collection('canonical_documents');

    // Normalize municipality code (ensure lowercase)
    const normalizedCode = municipalityCode.toLowerCase();

    // Query documents and check municipality code
    const documents = await collection
      .find({
        _id: { $in: documentIds.map((id) => new ObjectId(id)) },
      })
      .toArray();

    const filteredIds: string[] = [];

    for (const doc of documents) {
      const extractedCode = this.extractMunicipalityCode(doc as any);
      if (extractedCode && extractedCode.toLowerCase() === normalizedCode) {
        filteredIds.push(doc._id.toString());
      }
    }

    return filteredIds;
  }

  /**
   * Load geo extensions for multiple documents
   */
  private async loadGeoExtensions(
    documentIds: string[]
  ): Promise<Map<string, GeoExtensionPayload>> {
    try {
      // Load extensions in bulk
      return await this.geoExtensionService.getMany(documentIds);
    } catch (error) {
      logger.error({ error }, 'Failed to load geo extensions in bulk');
      return new Map();
    }
  }

  /**
   * Extract municipality code from document
   */
  extractMunicipalityCode(document: CanonicalDocument): string | undefined {
    // Check sourceMetadata.aangeleverdDoorEen?.code (DSO documents)
    const sourceMetadata = document.sourceMetadata || {};
    const aangeleverdDoorEen = sourceMetadata.aangeleverdDoorEen as
      | { code?: string; naam?: string }
      | undefined;
    if (aangeleverdDoorEen?.code) {
      return aangeleverdDoorEen.code;
    }

    // Check enrichmentMetadata.municipalityCode
    const enrichmentMetadata = document.enrichmentMetadata || {};
    if (typeof enrichmentMetadata.municipalityCode === 'string') {
      return enrichmentMetadata.municipalityCode;
    }

    // Check publisherAuthority and look up in gemeenten collection
    if (document.publisherAuthority) {
      // Try to find municipality by name and get code
      // This is async, so we'll handle it in a separate method if needed
      // For now, return undefined if not found in metadata
    }

    return undefined;
  }

  /**
   * Transform document and geo extension to Geoportaal format
   */
  private async transformToGeoportaalFormat(
    document: CanonicalDocument,
    geoExtension: GeoExtensionPayload,
    municipalityCodeMap?: Map<string, string>
  ): Promise<DocumentWithGeometry> {
    // Extract municipality code
    let municipalityCode = this.extractMunicipalityCode(document);

    // Use bulk lookup map if available
    if (!municipalityCode && document.publisherAuthority && municipalityCodeMap) {
      municipalityCode = municipalityCodeMap.get(document.publisherAuthority);
    }

    // Fallback to async lookup if still missing
    // Skip if we already performed bulk lookup (municipalityCodeMap provided)
    if (!municipalityCode && !municipalityCodeMap) {
      municipalityCode = await this.extractMunicipalityCodeAsync(document);
    }

    // Combine geometries
    const geometry = this.combineGeometries(geoExtension.geometriesWgs84 as Geometry[]);

    // Extract bbox (bboxWgs84 is a tuple [minLon, minLat, maxLon, maxLat])
    const bbox: [number, number, number, number] = geoExtension.bboxWgs84;

    // Build metadata object
    const metadata: Record<string, unknown> = {
      ...(document.publisherAuthority && { publisherAuthority: document.publisherAuthority }),
      ...(document.dates && { dates: document.dates }),
      ...(document.canonicalUrl && { canonicalUrl: document.canonicalUrl }),
    };

    return {
      id: document._id,
      title: document.title,
      source: document.source,
      documentType: document.documentType,
      municipalityCode,
      geometry,
      bbox,
      metadata,
    };
  }

  /**
   * Extract municipality code asynchronously (for gemeenten lookup)
   */
  private async extractMunicipalityCodeAsync(
    document: CanonicalDocument
  ): Promise<string | undefined> {
    // First try synchronous extraction
    const code = this.extractMunicipalityCode(document);
    if (code) {
      return code;
    }

    // If not found, try looking up by publisherAuthority
    if (document.publisherAuthority) {
      try {
        const gemeente = await GemeenteModel.findByName(document.publisherAuthority);
        if (gemeente?.municipalityCode) {
          return gemeente.municipalityCode;
        }
      } catch (error) {
        logger.debug(
          { error, publisherAuthority: document.publisherAuthority },
          'Failed to lookup municipality code from gemeenten collection'
        );
      }
    }

    return undefined;
  }

  /**
   * Combine multiple geometries into a single GeoJSON geometry
   */
  private combineGeometries(geometries: Geometry[]): Geometry | GeometryCollection {
    if (geometries.length === 0) {
      throw new Error('Cannot combine empty geometry array');
    }

    if (geometries.length === 1) {
      return geometries[0];
    }

    // Multiple geometries: combine into GeometryCollection
    return {
      type: 'GeometryCollection',
      geometries,
    };
  }
}
