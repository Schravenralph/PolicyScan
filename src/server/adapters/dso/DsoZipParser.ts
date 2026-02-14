/**
 * DsoZipParser - Parse DSO ZIP files and extract components
 * 
 * Extracts STOP/TPOD XML, GIO geometries, and OW-objecten from DSO ZIP files.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/07-dso-stop-tpod-adapter.md
 */

/**
 * Dependencies required:
 * - xml2js: pnpm install xml2js @types/xml2js
 * - jszip: pnpm install jszip @types/jszip
 */

import { parseStringPromise } from 'xml2js';
import JSZip from 'jszip';
import type { FeatureCollection, Geometry } from 'geojson';
import { logger } from '../../utils/logger.js';
import { extractMetadataByFileType } from './extractors/XmlMetadataExtractors.js';

/**
 * GIO geometry data
 */
export interface GioGeometry {
  identifier: string;
  geometry: Geometry | FeatureCollection;
  crs?: string; // e.g., 'EPSG:28992'
  metadata?: Record<string, unknown>;
}

/**
 * Parsed XML file with structure and metadata
 */
export interface ParsedXmlFile {
  filename: string;
  content: string; // Raw XML content
  parsed?: unknown; // Parsed XML structure (from xml2js)
  metadata?: Record<string, unknown>; // Extracted metadata
  rootElement?: string; // Root XML element name
  namespaces?: Record<string, string>; // XML namespaces
}

/**
 * Parsed DSO ZIP contents
 */
export interface DsoZipContents {
  stopTpodXmls: Array<{ filename: string; content: string }>; // Legacy: main STOP/TPOD XMLs
  allXmlFiles: ParsedXmlFile[]; // All XML files with parsed structure
  gioGeometries: GioGeometry[];
  owObjecten?: unknown; // Raw OW-objecten JSON
  metadata?: Record<string, unknown>; // Aggregated metadata from all sources
}

/**
 * DsoZipParser - Parse DSO ZIP files
 */
export class DsoZipParser {
  /**
   * Parse DSO ZIP file
   * 
   * @param zipBuffer - ZIP file as Buffer
   * @returns Parsed contents
   */
  async parse(zipBuffer: Buffer): Promise<DsoZipContents> {
    const zip = new JSZip();
    await zip.loadAsync(zipBuffer);

    const result: DsoZipContents = {
      stopTpodXmls: [],
      allXmlFiles: [],
      gioGeometries: [],
    };

    // Process each file in the ZIP
    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) {
        continue;
      }

      try {
        // Parse ALL XML files (not just STOP/TPOD)
        if (filename.toLowerCase().endsWith('.xml')) {
          const content = await file.async('string');
          const parsedXml = await this.parseXmlFile(filename, content);
          result.allXmlFiles.push(parsedXml);

          // Also add to stopTpodXmls for backward compatibility
          if (this.isStopTpodXml(filename)) {
            result.stopTpodXmls.push({ filename, content });
          }
        } else if (this.isGioFile(filename)) {
          const gio = await this.parseGioFile(filename, file);
          if (gio) {
            result.gioGeometries.push(gio);
          }
        } else if (this.isOwObjectenFile(filename)) {
          const content = await file.async('string');
          try {
            result.owObjecten = JSON.parse(content);
          } catch (error) {
            logger.warn({ filename, error }, 'Failed to parse OW-objecten JSON');
          }
        }
      } catch (error) {
        logger.warn({ filename, error }, 'Failed to process file in ZIP');
      }
    }

    // Aggregate metadata from all XML files
    result.metadata = this.aggregateMetadata(result.allXmlFiles);

    logger.debug(
      {
        xmlFileCount: result.allXmlFiles.length,
        stopTpodCount: result.stopTpodXmls.length,
        gioCount: result.gioGeometries.length,
        hasOwObjecten: !!result.owObjecten,
        metadataKeys: Object.keys(result.metadata || {}),
      },
      'Parsed DSO ZIP contents'
    );

    return result;
  }

  /**
   * Parse an XML file and extract structure and metadata
   */
  private async parseXmlFile(filename: string, content: string): Promise<ParsedXmlFile> {
    const parsed: ParsedXmlFile = {
      filename,
      content,
    };

    try {
      // Parse XML structure
      const xmlParsed = await parseStringPromise(content, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        normalize: true,
      });

      parsed.parsed = xmlParsed;

      // Extract root element name
      const rootKeys = Object.keys(xmlParsed).filter(k => !k.startsWith('_') && k !== '$');
      if (rootKeys.length > 0) {
        parsed.rootElement = rootKeys[0];
      }

      // Extract namespaces
      if (xmlParsed.$) {
        parsed.namespaces = xmlParsed.$ as Record<string, string>;
      }

      // Extract metadata based on file type
      parsed.metadata = this.extractMetadataFromXml(filename, xmlParsed);
    } catch (error) {
      logger.warn({ filename, error }, 'Failed to parse XML file');
    }

    return parsed;
  }

  /**
   * Extract metadata from XML based on file type and structure
   * 
   * Uses specialized extractors for each XML file type with documented use cases.
   * @see extractors/XmlMetadataExtractors.ts
   * @see docs/30-dso-omgevingsdocument-downloaden/XML-FILE-MAPPING-STRATEGY.md
   */
  private extractMetadataFromXml(filename: string, parsed: unknown): Record<string, unknown> {
    // Use specialized extractors for each file type
    const extracted = extractMetadataByFileType(filename, parsed);
    
    // Add filename for reference
    extracted.sourceFile = filename;
    
    return extracted;
  }


  /**
   * Aggregate metadata from all XML files into a structured metadata object
   * 
   * Organizes metadata by file type with clear use cases and priorities.
   * @see extractors/XmlMetadataExtractors.ts
   * @see docs/30-dso-omgevingsdocument-downloaden/XML-FILE-MAPPING-STRATEGY.md
   */
  private aggregateMetadata(xmlFiles: ParsedXmlFile[]): Record<string, unknown> {
    const aggregated: Record<string, unknown> = {
      xmlFileCount: xmlFiles.length,
      xmlFiles: xmlFiles.map(f => ({
        filename: f.filename,
        rootElement: f.rootElement,
        hasMetadata: !!f.metadata && Object.keys(f.metadata).length > 0,
      })),
    };

    // Organize metadata by file type (using specialized extractor structure)
    // Priority order for core fields:
    // 1. Regeling/Metadata.xml - Primary source for title, dates, publisher
    // 2. Regeling/Identificatie.xml - FRBR identifiers, document type
    // 3. Regeling/VersieMetadata.xml - Version information
    // 4. Regeling/Tekst.xml - Content metadata (already extracted by StopTpodExtractor)
    // 5. OW-bestanden/*.xml - Enrichment metadata (activities, rules, areas)
    // 6. Other files - Conditional use

    const metadataByType: Record<string, unknown> = {};
    const coreFields: Record<string, unknown> = {};

    // Process each XML file and organize by type
    for (const file of xmlFiles) {
      if (!file.metadata) continue;

      const metadata = file.metadata as Record<string, unknown>;
      const source = metadata.source as string || file.filename;

      // Store full metadata by source
      metadataByType[source] = metadata;

      // Extract core fields based on priority
      // Regeling/Metadata.xml - highest priority for core fields
      if (source.includes('Regeling/Metadata.xml')) {
        if (metadata.title && !coreFields.title) coreFields.title = metadata.title;
        if (metadata.bestuursorgaan && !coreFields.bestuursorgaan) coreFields.bestuursorgaan = metadata.bestuursorgaan;
        if (metadata.publishedAt && !coreFields.publishedAt) coreFields.publishedAt = metadata.publishedAt;
        if (metadata.validFrom && !coreFields.validFrom) coreFields.validFrom = metadata.validFrom;
        if (metadata.validUntil && !coreFields.validUntil) coreFields.validUntil = metadata.validUntil;
        if (metadata.status && !coreFields.status) coreFields.status = metadata.status;
        if (metadata.documentType && !coreFields.documentType) coreFields.documentType = metadata.documentType;
      }

      // Regeling/Identificatie.xml - FRBR identifiers
      if (source.includes('Identificatie.xml')) {
        if (metadata.frbrWork && !coreFields.frbrWork) coreFields.frbrWork = metadata.frbrWork;
        if (metadata.frbrExpression && !coreFields.frbrExpression) coreFields.frbrExpression = metadata.frbrExpression;
        if (metadata.soortWork && !coreFields.documentType) coreFields.documentType = metadata.soortWork;
      }

      // Regeling/VersieMetadata.xml - version info
      if (source.includes('VersieMetadata.xml')) {
        if (metadata.versie && !coreFields.versie) coreFields.versie = metadata.versie;
        if (metadata.versienummer && !coreFields.versienummer) coreFields.versienummer = metadata.versienummer;
      }
    }

    // Merge core fields into aggregated (for backward compatibility)
    Object.assign(aggregated, coreFields);

    // Store organized metadata structure
    aggregated.metadataByType = metadataByType;
    aggregated.coreFields = coreFields;

    return aggregated;
  }

  /**
   * Check if file is STOP/TPOD XML
   * 
   * DSO ZIP files contain XML in various locations:
   * - Regeling/Tekst.xml - Main STOP/TPOD XML document
   * - OW-bestanden/*.xml - OW-specific XML files (may also contain STOP/TPOD)
   * - Files with "stop", "tpod", "omgevingsplan", "besluit" in name
   */
  private isStopTpodXml(filename: string): boolean {
    const lower = filename.toLowerCase();
    if (!lower.endsWith('.xml')) {
      return false;
    }
    
    // Check for explicit STOP/TPOD indicators
    if (
      lower.includes('stop') ||
      lower.includes('tpod') ||
      lower.includes('omgevingsplan') ||
      lower.includes('besluit')
    ) {
      return true;
    }
    
    // Check for Regeling/Tekst.xml (main document text)
    if (lower.includes('regeling') && lower.includes('tekst.xml')) {
      return true;
    }
    
    // Check for files in Regeling folder (likely STOP/TPOD)
    if (lower.startsWith('regeling/') && lower.endsWith('.xml')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if file is GIO geometry file
   */
  private isGioFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.includes('gio') || 
           lower.endsWith('.geojson') || 
           lower.endsWith('.gml') ||
           lower.includes('geometrie');
  }

  /**
   * Check if file is OW-objecten file
   */
  private isOwObjectenFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.includes('ow-objecten') || 
           lower.includes('objecten.json');
  }

  /**
   * Parse GIO file (GeoJSON or GML)
   */
  private async parseGioFile(filename: string, file: JSZip.JSZipObject): Promise<GioGeometry | null> {
    try {
      const content = await file.async('string');
      const lower = filename.toLowerCase();

      if (lower.endsWith('.geojson')) {
        // Parse GeoJSON
        const geojson = JSON.parse(content) as FeatureCollection | Geometry;
        
        // Extract CRS from GeoJSON if present
        let crs: string | undefined;
        if ('crs' in geojson && geojson.crs) {
          const crsObj = geojson.crs as { type: string; properties: { name: string } };
          if (crsObj.properties?.name) {
            crs = crsObj.properties.name;
          }
        }

        // Default to EPSG:28992 for DSO GIO if not specified
        if (!crs) {
          crs = 'EPSG:28992';
        }

        return {
          identifier: filename,
          geometry: geojson,
          crs,
        };
      } else if (lower.endsWith('.gml')) {
        // Parse GML (simplified - would need proper GML parser in production)
        // For MVP, try to extract basic geometry and CRS
        const parsed = await parseStringPromise(content, {
          explicitArray: false,
          mergeAttrs: true,
          trim: true,
          normalize: true,
        });

        // Extract CRS from boundedBy envelope
        let crs = 'EPSG:28992'; // Default for Dutch RD
        const featureCollection = this.findInParsed(parsed, [
          'imro:FeatureCollectionIMRO',
          'FeatureCollectionIMRO',
        ]);

        if (featureCollection) {
          const boundedBy = this.findInParsed(featureCollection, ['gml:boundedBy', 'boundedBy']);
          if (boundedBy) {
            const envelope = this.findInParsed(boundedBy, ['gml:Envelope', 'Envelope']);
            if (envelope && typeof envelope === 'object') {
              const env = envelope as Record<string, unknown>;
              const srsName = env['srsName'] || env['srsname'];
              if (typeof srsName === 'string') {
                // Extract EPSG code from srsName (e.g., "urn:ogc:def:crs:EPSG::28992")
                const epsgMatch = srsName.match(/EPSG[:\s]*(\d+)/i);
                if (epsgMatch) {
                  crs = `EPSG:${epsgMatch[1]}`;
                }
              }
            }
          }
        }

        // Extract geometry from GML (simplified - extracts bounding box)
        const geometry = this.extractGeometryFromGml(parsed);
        if (geometry) {
          return {
            identifier: filename,
            geometry,
            crs,
          };
        }
      }
    } catch (error) {
      logger.warn({ filename, error }, 'Failed to parse GIO file');
    }

    return null;
  }

  /**
   * Extract geometry from GML - extracts actual geometries (Polygon, LineString, Point, etc.)
   * 
   * Parses actual geometry elements from IMRO GML structure:
   * - gml:Polygon with gml:exterior and gml:interior (holes)
   * - gml:LineString with gml:posList or gml:pos elements
   * - gml:Point with gml:pos element
   * - Multiple geometries are combined into a GeometryCollection
   * 
   * Falls back to bounding box extraction if no explicit geometries are found.
   */
  private extractGeometryFromGml(parsed: unknown): Geometry | null {
    try {
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      const obj = parsed as Record<string, unknown>;
      
      // Find FeatureCollectionIMRO (IMRO GML root) or other GML feature collections
      const featureCollection = this.findInParsed(obj, [
        'imro:FeatureCollectionIMRO',
        'FeatureCollectionIMRO',
        'gml:FeatureCollection',
        'FeatureCollection',
      ]);

      if (!featureCollection) {
        return null;
      }

      // Extract all geometries from the feature collection
      const geometries: Geometry[] = [];

      // Find all geometry elements recursively
      this.extractGeometriesFromObject(featureCollection, geometries);

      if (geometries.length === 0) {
        // Fallback to bounding box extraction if no explicit geometries found
        return this.extractBoundingBoxAsPolygon(featureCollection);
      }

      // Return single geometry or GeometryCollection
      if (geometries.length === 1) {
        return geometries[0];
      }

      return {
        type: 'GeometryCollection',
        geometries,
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to extract geometry from GML');
      return null;
    }
  }

  /**
   * Extract all geometries from a GML object recursively
   */
  private extractGeometriesFromObject(obj: unknown, geometries: Geometry[]): void {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    const record = obj as Record<string, unknown>;

    // Check for geometry elements
    for (const [key, value] of Object.entries(record)) {
      if (key.includes('Polygon') || key === 'gml:Polygon' || key === 'Polygon') {
        const polygon = this.parseGmlPolygon(value);
        if (polygon) {
          geometries.push(polygon);
        }
      } else if (key.includes('LineString') || key === 'gml:LineString' || key === 'LineString') {
        const lineString = this.parseGmlLineString(value);
        if (lineString) {
          geometries.push(lineString);
        }
      } else if (key.includes('Point') || key === 'gml:Point' || key === 'Point') {
        const point = this.parseGmlPoint(value);
        if (point) {
          geometries.push(point);
        }
      } else if (key.includes('MultiPolygon') || key === 'gml:MultiPolygon' || key === 'MultiPolygon') {
        const multiPolygon = this.parseGmlMultiPolygon(value);
        if (multiPolygon) {
          geometries.push(multiPolygon);
        }
      } else if (key.includes('MultiLineString') || key === 'gml:MultiLineString' || key === 'MultiLineString') {
        const multiLineString = this.parseGmlMultiLineString(value);
        if (multiLineString) {
          geometries.push(multiLineString);
        }
      } else if (key.includes('MultiPoint') || key === 'gml:MultiPoint' || key === 'MultiPoint') {
        const multiPoint = this.parseGmlMultiPoint(value);
        if (multiPoint) {
          geometries.push(multiPoint);
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively search in nested objects
        this.extractGeometriesFromObject(value, geometries);
      }
    }
  }

  /**
   * Parse GML Polygon element
   */
  private parseGmlPolygon(polygonObj: unknown): Geometry | null {
    if (typeof polygonObj !== 'object' || polygonObj === null) {
      return null;
    }

    const obj = polygonObj as Record<string, unknown>;
    const coordinates: number[][][] = [];

    // Extract exterior ring
    const exterior = this.findInParsed(obj, ['gml:exterior', 'exterior', 'gml:outerBoundaryIs', 'outerBoundaryIs']);
    if (exterior) {
      const exteriorRing = this.parseGmlRing(exterior);
      if (exteriorRing && exteriorRing.length > 0) {
        coordinates.push(exteriorRing);
      }
    }

    // Extract interior rings (holes)
    const interiors = this.findAllInParsed(obj, ['gml:interior', 'interior', 'gml:innerBoundaryIs', 'innerBoundaryIs']);
    for (const interior of interiors) {
      const interiorRing = this.parseGmlRing(interior);
      if (interiorRing && interiorRing.length > 0) {
        coordinates.push(interiorRing);
      }
    }

    if (coordinates.length === 0) {
      return null;
    }

    return {
      type: 'Polygon',
      coordinates: coordinates as [number, number][][],
    };
  }

  /**
   * Parse GML LineString element
   */
  private parseGmlLineString(lineStringObj: unknown): Geometry | null {
    if (typeof lineStringObj !== 'object' || lineStringObj === null) {
      return null;
    }

    const coordinates = this.parseGmlCoordinates(lineStringObj);
    if (!coordinates || coordinates.length < 2) {
      return null;
    }

    return {
      type: 'LineString',
      coordinates: coordinates as [number, number][],
    };
  }

  /**
   * Parse GML Point element
   */
  private parseGmlPoint(pointObj: unknown): Geometry | null {
    if (typeof pointObj !== 'object' || pointObj === null) {
      return null;
    }

    const pos = this.findInParsed(pointObj, ['gml:pos', 'pos', 'gml:coordinates', 'coordinates']);
    if (!pos) {
      return null;
    }

    const coords = this.parseGmlPos(pos);
    if (!coords) {
      return null;
    }

    return {
      type: 'Point',
      coordinates: coords,
    };
  }

  /**
   * Parse GML MultiPolygon element
   */
  private parseGmlMultiPolygon(multiPolygonObj: unknown): Geometry | null {
    if (typeof multiPolygonObj !== 'object' || multiPolygonObj === null) {
      return null;
    }

    const obj = multiPolygonObj as Record<string, unknown>;
    const polygons: number[][][][] = [];

    const polygonMembers = this.findAllInParsed(obj, ['gml:polygonMember', 'polygonMember', 'gml:polygonMembers', 'polygonMembers']);
    for (const member of polygonMembers) {
      const polygon = this.parseGmlPolygon(member);
      if (polygon && polygon.type === 'Polygon') {
        polygons.push(polygon.coordinates as number[][][]);
      }
    }

    if (polygons.length === 0) {
      return null;
    }

    return {
      type: 'MultiPolygon',
      coordinates: polygons as [number, number][][][],
    };
  }

  /**
   * Parse GML MultiLineString element
   */
  private parseGmlMultiLineString(multiLineStringObj: unknown): Geometry | null {
    if (typeof multiLineStringObj !== 'object' || multiLineStringObj === null) {
      return null;
    }

    const obj = multiLineStringObj as Record<string, unknown>;
    const lineStrings: number[][][] = [];

    const lineStringMembers = this.findAllInParsed(obj, ['gml:lineStringMember', 'lineStringMember', 'gml:lineStringMembers', 'lineStringMembers']);
    for (const member of lineStringMembers) {
      const lineString = this.parseGmlLineString(member);
      if (lineString && lineString.type === 'LineString') {
        lineStrings.push(lineString.coordinates as number[][]);
      }
    }

    if (lineStrings.length === 0) {
      return null;
    }

    return {
      type: 'MultiLineString',
      coordinates: lineStrings as [number, number][][],
    };
  }

  /**
   * Parse GML MultiPoint element
   */
  private parseGmlMultiPoint(multiPointObj: unknown): Geometry | null {
    if (typeof multiPointObj !== 'object' || multiPointObj === null) {
      return null;
    }

    const obj = multiPointObj as Record<string, unknown>;
    const points: number[][] = [];

    const pointMembers = this.findAllInParsed(obj, ['gml:pointMember', 'pointMember', 'gml:pointMembers', 'pointMembers']);
    for (const member of pointMembers) {
      const point = this.parseGmlPoint(member);
      if (point && point.type === 'Point') {
        points.push(point.coordinates as number[]);
      }
    }

    if (points.length === 0) {
      return null;
    }

    return {
      type: 'MultiPoint',
      coordinates: points as [number, number][],
    };
  }

  /**
   * Parse GML ring (exterior or interior boundary)
   */
  private parseGmlRing(ringObj: unknown): number[][] | null {
    if (typeof ringObj !== 'object' || ringObj === null) {
      return null;
    }

    // Find LinearRing or direct coordinates
    const linearRing = this.findInParsed(ringObj, ['gml:LinearRing', 'LinearRing', 'gml:linearRing', 'linearRing']);
    if (linearRing) {
      return this.parseGmlCoordinates(linearRing);
    }

    // Try direct coordinates
    return this.parseGmlCoordinates(ringObj);
  }

  /**
   * Parse coordinates from GML element (supports posList, pos, coordinates)
   */
  private parseGmlCoordinates(coordObj: unknown): number[][] | null {
    if (typeof coordObj !== 'object' || coordObj === null) {
      return null;
    }

    // Try posList first (most common for LineString and Polygon rings)
    const posList = this.findInParsed(coordObj, ['gml:posList', 'posList']);
    if (posList) {
      return this.parseGmlPosList(posList);
    }

    // Try pos (single position or array of positions)
    const pos = this.findInParsed(coordObj, ['gml:pos', 'pos']);
    if (pos) {
      const coords = this.parseGmlPos(pos);
      return coords ? [coords] : null;
    }

    // Try coordinates (legacy format)
    const coordinates = this.findInParsed(coordObj, ['gml:coordinates', 'coordinates']);
    if (coordinates) {
      return this.parseGmlCoordinatesString(coordinates);
    }

    return null;
  }

  /**
   * Parse GML posList (space-separated coordinate pairs)
   */
  private parseGmlPosList(posList: unknown): number[][] | null {
    if (typeof posList !== 'string') {
      // Sometimes posList is an object with $text or _text
      const obj = posList as Record<string, unknown>;
      const text = obj.$text || obj._text || obj.text || obj;
      if (typeof text === 'string') {
        return this.parseGmlPosList(text);
      }
      return null;
    }

    const parts = posList.trim().split(/\s+/);
    if (parts.length < 2 || parts.length % 2 !== 0) {
      return null;
    }

    const coordinates: number[][] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const x = parseFloat(parts[i]);
      const y = parseFloat(parts[i + 1]);
      if (isNaN(x) || isNaN(y)) {
        return null;
      }
      coordinates.push([x, y]);
    }

    return coordinates.length > 0 ? coordinates : null;
  }

  /**
   * Parse GML pos (single coordinate pair)
   */
  private parseGmlPos(pos: unknown): [number, number] | null {
    if (typeof pos === 'string') {
      const parts = pos.trim().split(/\s+/);
      if (parts.length < 2) {
        return null;
      }
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (isNaN(x) || isNaN(y)) {
        return null;
      }
      return [x, y];
    }

    // Sometimes pos is an object with $text or _text
    if (typeof pos === 'object' && pos !== null) {
      const obj = pos as Record<string, unknown>;
      const text = obj.$text || obj._text || obj.text;
      if (typeof text === 'string') {
        return this.parseGmlPos(text);
      }
    }

    return null;
  }

  /**
   * Parse GML coordinates string (legacy format: "x1,y1 x2,y2" or "x1 y1 x2 y2")
   */
  private parseGmlCoordinatesString(coords: unknown): number[][] | null {
    if (typeof coords !== 'string') {
      const obj = coords as Record<string, unknown>;
      const text = obj.$text || obj._text || obj.text;
      if (typeof text === 'string') {
        return this.parseGmlCoordinatesString(text);
      }
      return null;
    }

    // Try comma-separated format first: "x1,y1 x2,y2"
    if (coords.includes(',')) {
      const pairs = coords.trim().split(/\s+/);
      const coordinates: number[][] = [];
      for (const pair of pairs) {
        const parts = pair.split(',');
        if (parts.length >= 2) {
          const x = parseFloat(parts[0]);
          const y = parseFloat(parts[1]);
          if (!isNaN(x) && !isNaN(y)) {
            coordinates.push([x, y]);
          }
        }
      }
      return coordinates.length > 0 ? coordinates : null;
    }

    // Fall back to space-separated format: "x1 y1 x2 y2"
    return this.parseGmlPosList(coords);
  }

  /**
   * Extract bounding box as Polygon (fallback when no explicit geometries found)
   */
  private extractBoundingBoxAsPolygon(featureCollection: unknown): Geometry | null {
    const boundedBy = this.findInParsed(featureCollection, ['gml:boundedBy', 'boundedBy']);
    if (!boundedBy) {
      return null;
    }

    const envelope = this.findInParsed(boundedBy, ['gml:Envelope', 'Envelope']);
    if (!envelope || typeof envelope !== 'object') {
      return null;
    }

    const env = envelope as Record<string, unknown>;
    
    const lowerCorner = this.findInParsed(env, ['gml:lowerCorner', 'lowerCorner']);
    const upperCorner = this.findInParsed(env, ['gml:upperCorner', 'upperCorner']);

    if (!lowerCorner || !upperCorner) {
      return null;
    }

    const parseCoords = (corner: unknown): [number, number] | null => {
      if (typeof corner !== 'string') {
        return null;
      }
      const parts = corner.trim().split(/[\s,]+/);
      if (parts.length < 2) {
        return null;
      }
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);
      if (isNaN(x) || isNaN(y)) {
        return null;
      }
      return [x, y];
    };

    const lower = parseCoords(lowerCorner);
    const upper = parseCoords(upperCorner);

    if (!lower || !upper) {
      return null;
    }

    // Create a Polygon from the bounding box
    return {
      type: 'Polygon',
      coordinates: [[
        [lower[0], lower[1]], // lower-left
        [upper[0], lower[1]], // lower-right
        [upper[0], upper[1]], // upper-right
        [lower[0], upper[1]], // upper-left
        [lower[0], lower[1]], // close polygon
      ]],
    };
  }

  /**
   * Find all occurrences of keys in parsed XML object (recursive search)
   */
  private findAllInParsed(obj: unknown, keys: string[]): unknown[] {
    const results: unknown[] = [];

    if (typeof obj !== 'object' || obj === null) {
      return results;
    }

    // Use an explicit stack to avoid stack overflow on deeply nested structures
    const stack: unknown[] = [obj];

    while (stack.length > 0) {
      const current = stack.pop();

      if (typeof current !== 'object' || current === null) {
        continue;
      }

      const record = current as Record<string, unknown>;

      // Check if any key matches
      for (const key of keys) {
        if (key in record) {
          const value = record[key];
          if (Array.isArray(value)) {
            results.push(...value);
          } else {
            results.push(value);
          }
        }
      }

      // Add nested objects to the stack for further traversal
      for (const value of Object.values(record)) {
        if (typeof value === 'object' && value !== null) {
          stack.push(value);
        }
      }
    }

    return results;
  }

  /**
   * Helper to find value in parsed XML object (recursive search)
   */
  private findInParsed(obj: unknown, keys: string[]): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return null;
    }

    const record = obj as Record<string, unknown>;

    // Try each key
    for (const key of keys) {
      if (key in record) {
        return record[key];
      }
    }

    // Recursively search in nested objects
    for (const value of Object.values(record)) {
      if (typeof value === 'object' && value !== null) {
        const found = this.findInParsed(value, keys);
        if (found !== null) {
          return found;
        }
      }
    }

    return null;
  }
}

