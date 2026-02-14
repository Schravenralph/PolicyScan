/**
 * Specialized XML Metadata Extractors
 * 
 * Each extractor is designed for a specific XML file type in DSO ZIP packages.
 * Each extractor has:
 * - Clear purpose and use cases
 * - Documented field mappings
 * - Decision on whether to use the data
 * 
 * @see docs/30-dso-omgevingsdocument-downloaden/XML-FILE-MAPPING-STRATEGY.md
 */

import { logger } from '../../../utils/logger.js';

/**
 * Base interface for extracted metadata
 */
export interface ExtractedMetadata {
  [key: string]: unknown;
}

/**
 * Extract metadata from Regeling/Identificatie.xml
 * 
 * Purpose: Document identification and FRBR metadata
 * Use Cases:
 * - Primary identifier (FRBRWork → sourceId)
 * - Version tracking (FRBRExpression)
 * - Document type detection (soortWork)
 * - Deduplication (FRBR identifiers)
 * 
 * Decision: ✅ USE - Critical for document identification
 */
export function extractIdentificatieMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'Regeling/Identificatie.xml',
    purpose: 'Document identification and FRBR metadata',
    useCase: 'Primary identifier, version tracking, document type detection, deduplication',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Look for FRBRWork, FRBRExpression in various paths
  const findFrbr = (path: string[]): Record<string, unknown> | null => {
    let current: unknown = obj;
    for (const part of path) {
      if (typeof current === 'object' && current !== null) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return null;
      }
    }
    return typeof current === 'object' && current !== null ? (current as Record<string, unknown>) : null;
  };

  // Try common paths for FRBR data
  const paths = [
    ['data:ExpressionIdentificatie'],
    ['ExpressionIdentificatie'],
    ['identificatie'],
    ['Identificatie'],
  ];

  for (const path of paths) {
    const frbrData = findFrbr(path);
    if (frbrData) {
      // Extract FRBRWork
      if (frbrData['data:FRBRWork'] || frbrData['FRBRWork']) {
        const work = (frbrData['data:FRBRWork'] || frbrData['FRBRWork']) as Record<string, unknown>;
        metadata.frbrWork = {
          this: work['data:FRBRthis'] || work['FRBRthis'],
          uri: work['data:FRBRuri'] || work['FRBRuri'],
          date: work['data:FRBRdate'] || work['FRBRdate'],
          author: work['data:FRBRauthor'] || work['FRBRauthor'],
        };
      }

      // Extract FRBRExpression
      if (frbrData['data:FRBRExpression'] || frbrData['FRBRExpression']) {
        const expr = (frbrData['data:FRBRExpression'] || frbrData['FRBRExpression']) as Record<string, unknown>;
        metadata.frbrExpression = {
          this: expr['data:FRBRthis'] || expr['FRBRthis'],
          uri: expr['data:FRBRuri'] || expr['FRBRuri'],
          date: expr['data:FRBRdate'] || expr['FRBRdate'],
          author: expr['data:FRBRauthor'] || expr['FRBRauthor'],
        };
      }

      // Extract soortWork (document type)
      if (frbrData['data:soortWork'] || frbrData['soortWork']) {
        metadata.soortWork = frbrData['data:soortWork'] || frbrData['soortWork'];
      }

      // Store full structure for reference
      metadata.full = frbrData;
      break;
    }
  }

  return metadata;
}

/**
 * Extract metadata from Regeling/Metadata.xml
 * 
 * Purpose: Document-level metadata
 * Use Cases:
 * - Title (primary source)
 * - Publisher/Authority
 * - Dates (publication, validity, expiry)
 * - Status information
 * 
 * Decision: ✅ USE - Primary source for document metadata
 */
export function extractRegelingMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'Regeling/Metadata.xml',
    purpose: 'Document-level metadata',
    useCase: 'Title, publisher, dates, status',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  let obj = parsed as Record<string, unknown>;

  // Unwrap root element if present (common with xml2js)
  if (obj['Metadata'] && typeof obj['Metadata'] === 'object') {
    obj = obj['Metadata'] as Record<string, unknown>;
  } else if (obj['metadata'] && typeof obj['metadata'] === 'object') {
    obj = obj['metadata'] as Record<string, unknown>;
  }

  // Extract title (priority field)
  const titleFields = ['titel', 'Titel', 'title', 'naam', 'Naam'];
  for (const field of titleFields) {
    if (obj[field]) {
      metadata.title = obj[field];
      break;
    }
  }

  // Extract publisher/authority
  const publisherFields = ['bestuursorgaan', 'Bestuursorgaan', 'opgesteldDoor', 'OpgesteldDoor', 'publisher', 'uitgever'];
  for (const field of publisherFields) {
    if (obj[field]) {
      metadata.bestuursorgaan = obj[field];
      break;
    }
  }

  // Extract dates
  const dateMappings: Record<string, string> = {
    'publicatiedatum': 'publishedAt',
    'Publicatiedatum': 'publishedAt',
    'geldigheidsdatum': 'validFrom',
    'Geldigheidsdatum': 'validFrom',
    'geldigVanaf': 'validFrom',
    'vervaldatum': 'validUntil',
    'Vervaldatum': 'validUntil',
    'geldigTot': 'validUntil',
  };

  for (const [xmlField, canonicalField] of Object.entries(dateMappings)) {
    if (obj[xmlField]) {
      metadata[canonicalField] = obj[xmlField];
    }
  }

  // Extract status
  if (obj['status'] || obj['Status']) {
    metadata.status = obj['status'] || obj['Status'];
  }

  // Extract document type
  if (obj['type'] || obj['Type'] || obj['documentType']) {
    metadata.documentType = obj['type'] || obj['Type'] || obj['documentType'];
  }

  return metadata;
}

/**
 * Extract metadata from Regeling/VersieMetadata.xml
 * 
 * Purpose: Version-specific metadata
 * Use Cases:
 * - Version tracking
 * - Version relationships
 * - Version status
 * 
 * Decision: ✅ USE - Important for version management
 */
export function extractVersieMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'Regeling/VersieMetadata.xml',
    purpose: 'Version-specific metadata',
    useCase: 'Version tracking, version relationships, version status',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  let obj = parsed as Record<string, unknown>;

  // Unwrap root element if present
  if (obj['VersieMetadata'] && typeof obj['VersieMetadata'] === 'object') {
    obj = obj['VersieMetadata'] as Record<string, unknown>;
  } else if (obj['versieMetadata'] && typeof obj['versieMetadata'] === 'object') {
    obj = obj['versieMetadata'] as Record<string, unknown>;
  }

  // Extract version number
  if (obj['versie'] || obj['Versie']) {
    metadata.versie = obj['versie'] || obj['Versie'];
  }
  if (obj['versienummer'] || obj['Versienummer']) {
    metadata.versienummer = obj['versienummer'] || obj['Versienummer'];
  }

  // Extract version status
  if (obj['status'] || obj['Status']) {
    metadata.status = obj['status'] || obj['Status'];
  }

  // Extract version dates
  if (obj['versieDatum'] || obj['VersieDatum']) {
    metadata.versieDatum = obj['versieDatum'] || obj['VersieDatum'];
  }

  // Extract version relationships (previous/next)
  if (obj['vorigeVersie'] || obj['VorigeVersie']) {
    metadata.vorigeVersie = obj['vorigeVersie'] || obj['VorigeVersie'];
  }
  if (obj['volgendeVersie'] || obj['VolgendeVersie']) {
    metadata.volgendeVersie = obj['volgendeVersie'] || obj['VolgendeVersie'];
  }

  return metadata;
}

/**
 * Extract metadata from Regeling/Momentopname.xml
 * 
 * Purpose: Snapshot/point-in-time information
 * Use Cases:
 * - Temporal queries
 * - Version snapshots
 * - Audit trail
 * 
 * Decision: ⚠️ CONDITIONAL USE - Use if temporal queries needed
 */
export function extractMomentopnameMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'Regeling/Momentopname.xml',
    purpose: 'Snapshot/point-in-time information',
    useCase: 'Temporal queries, version snapshots, audit trail',
    decision: 'CONDITIONAL USE - Use if temporal queries needed',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Extract snapshot date
  if (obj['datum'] || obj['Datum'] || obj['momentopnameDatum']) {
    metadata.datum = obj['datum'] || obj['Datum'] || obj['momentopnameDatum'];
  }

  // Extract snapshot metadata
  if (obj['momentopname'] || obj['Momentopname']) {
    const momentopname = obj['momentopname'] || obj['Momentopname'];
    if (typeof momentopname === 'object' && momentopname !== null) {
      metadata.momentopname = momentopname;
    }
  }

  return metadata;
}

/**
 * Extract metadata from OW-bestanden/activiteiten.xml
 * 
 * Purpose: Activities catalog
 * Use Cases:
 * - Activity search
 * - Activity-rules mapping
 * - Activity catalog
 * 
 * Decision: ✅ USE - Valuable for activity-based search
 */
export function extractActiviteitenMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'OW-bestanden/activiteiten.xml',
    purpose: 'Activities catalog',
    useCase: 'Activity search, activity-rules mapping, activity catalog',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Find activities array
  let activities: unknown[] = [];
  
  if (Array.isArray(obj)) {
    activities = obj;
  } else if (obj['activiteiten'] || obj['Activiteiten']) {
    const activiteiten = obj['activiteiten'] || obj['Activiteiten'];
    activities = Array.isArray(activiteiten) ? activiteiten : [activiteiten];
  } else if (obj['_embedded'] && typeof obj['_embedded'] === 'object') {
    const embedded = obj['_embedded'] as Record<string, unknown>;
    if (embedded['activiteiten']) {
      const activiteiten = embedded['activiteiten'];
      activities = Array.isArray(activiteiten) ? activiteiten : [activiteiten];
    }
  }

  metadata.count = activities.length;
  metadata.activiteiten = activities.slice(0, 100); // Store first 100 for reference

  // Extract activity identifiers if available
  const identifiers = activities
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .map(a => a['identificatie'] || a['id'] || a['identifier'])
    .filter((id): id is string => typeof id === 'string');
  
  // Always set identifiers array (empty if none found)
  metadata.identifiers = identifiers;

  return metadata;
}

/**
 * Extract metadata from OW-bestanden/regelsvooriedereen.xml
 * 
 * Purpose: General rules (rules that apply to everyone)
 * Use Cases:
 * - Rule extraction
 * - Rule search
 * - Rule categorization
 * - Rule-text mapping
 * 
 * Decision: ✅ USE - Critical for rule-based queries
 */
export function extractRegelsVoorIedereenMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'OW-bestanden/regelsvooriedereen.xml',
    purpose: 'General rules (rules that apply to everyone)',
    useCase: 'Rule extraction, rule search, rule categorization, rule-text mapping',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Find rules array
  let regels: unknown[] = [];
  
  if (Array.isArray(obj)) {
    regels = obj;
  } else if (obj['regels'] || obj['Regels'] || obj['regelsVoorIedereen']) {
    const rules = obj['regels'] || obj['Regels'] || obj['regelsVoorIedereen'];
    regels = Array.isArray(rules) ? rules : [rules];
  } else if (obj['_embedded'] && typeof obj['_embedded'] === 'object') {
    const embedded = obj['_embedded'] as Record<string, unknown>;
    if (embedded['regels']) {
      const rules = embedded['regels'];
      regels = Array.isArray(rules) ? rules : [rules];
    }
  }

  metadata.count = regels.length;
  
  // Extract rule summaries (not full content - too large)
  const ruleSummaries = regels
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .slice(0, 50) // First 50 rules
    .map(r => ({
      identificatie: r['identificatie'] || r['id'],
      titel: r['titel'] || r['title'],
      type: r['type'] || r['soort'],
      hasTekst: !!(r['tekst'] || r['text'] || r['inhoud']),
    }));

  metadata.ruleSummaries = ruleSummaries;

  return metadata;
}

/**
 * Extract metadata from OW-bestanden/regelteksten.xml
 * 
 * Purpose: Rule texts
 * Use Cases:
 * - Rule text extraction
 * - Rule-text linking
 * - Rule analysis
 * 
 * Decision: ✅ USE - May overlap with regelsvooriedereen, but store both
 */
export function extractRegeltekstenMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'OW-bestanden/regelteksten.xml',
    purpose: 'Rule texts',
    useCase: 'Rule text extraction, rule-text linking, rule analysis',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Find rule texts array
  let regelteksten: unknown[] = [];
  
  if (Array.isArray(obj)) {
    regelteksten = obj;
  } else if (obj['regelteksten'] || obj['Regelteksten']) {
    const texts = obj['regelteksten'] || obj['Regelteksten'];
    regelteksten = Array.isArray(texts) ? texts : [texts];
  }

  metadata.count = regelteksten.length;
  
  // Extract rule text identifiers (not full text - too large)
  const textIdentifiers = regelteksten
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .slice(0, 50)
    .map(t => {
      const tekst = t['tekst'] || t['text'] || t['inhoud'];
      const tekstStr = typeof tekst === 'string' ? tekst : '';
      return {
        identificatie: t['identificatie'] || t['id'],
        regelId: t['regelId'] || t['regel_id'],
        hasTekst: !!tekstStr,
        tekstLength: tekstStr.length,
      };
    });

  metadata.textIdentifiers = textIdentifiers;

  return metadata;
}

/**
 * Extract metadata from OW-bestanden/ambtsgebieden.xml
 * 
 * Purpose: Administrative areas
 * Use Cases:
 * - Geographic queries
 * - Area-rule mapping
 * - Area boundaries
 * 
 * Decision: ✅ USE - Important for geographic queries
 */
export function extractAmbtsgebiedenMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'OW-bestanden/ambtsgebieden.xml',
    purpose: 'Administrative areas',
    useCase: 'Geographic queries, area-rule mapping, area boundaries',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Find ambtsgebieden array
  let ambtsgebieden: unknown[] = [];
  
  if (Array.isArray(obj)) {
    ambtsgebieden = obj;
  } else if (obj['ambtsgebieden'] || obj['Ambtsgebieden']) {
    const areas = obj['ambtsgebieden'] || obj['Ambtsgebieden'];
    ambtsgebieden = Array.isArray(areas) ? areas : [areas];
  }

  metadata.count = ambtsgebieden.length;
  
  // Extract area identifiers and names
  const areaSummaries = ambtsgebieden
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .slice(0, 50)
    .map(a => ({
      identificatie: a['identificatie'] || a['id'],
      naam: a['naam'] || a['name'] || a['titel'],
      hasGeometry: !!(a['geometrie'] || a['geometry'] || a['geo']),
    }));

  metadata.areaSummaries = areaSummaries;

  return metadata;
}

/**
 * Extract metadata from OW-bestanden/regelingsgebieden.xml
 * 
 * Purpose: Regulation areas
 * Use Cases:
 * - Geographic scope
 * - Area-rule mapping
 * - Spatial queries
 * 
 * Decision: ✅ USE - Critical for geographic/spatial queries
 */
export function extractRegelingsgebiedenMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'OW-bestanden/regelingsgebieden.xml',
    purpose: 'Regulation areas',
    useCase: 'Geographic scope, area-rule mapping, spatial queries',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Find regelingsgebieden array
  let regelingsgebieden: unknown[] = [];
  
  if (Array.isArray(obj)) {
    regelingsgebieden = obj;
  } else if (obj['regelingsgebieden'] || obj['Regelingsgebieden']) {
    const areas = obj['regelingsgebieden'] || obj['Regelingsgebieden'];
    regelingsgebieden = Array.isArray(areas) ? areas : [areas];
  }

  metadata.count = regelingsgebieden.length;
  
  // Extract regulation area identifiers and geographic info
  const areaSummaries = regelingsgebieden
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
    .slice(0, 50)
    .map(a => ({
      identificatie: a['identificatie'] || a['id'],
      naam: a['naam'] || a['name'] || a['titel'],
      hasGeometry: !!(a['geometrie'] || a['geometry'] || a['geo']),
      regelIds: Array.isArray(a['regelIds'] || a['regel_ids']) 
        ? (a['regelIds'] || a['regel_ids'] as unknown[])
        : undefined,
    }));

  metadata.areaSummaries = areaSummaries;

  return metadata;
}

/**
 * Extract metadata from OW-bestanden/manifest-ow.xml
 * 
 * Purpose: Manifest/index of OW-bestanden contents
 * Use Cases:
 * - File validation
 * - File relationships
 * - Package integrity
 * 
 * Decision: ⚠️ CONDITIONAL USE - Use for validation, not critical for content
 */
export function extractManifestOwMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'OW-bestanden/manifest-ow.xml',
    purpose: 'Manifest/index of OW-bestanden contents',
    useCase: 'File validation, file relationships, package integrity',
    decision: 'CONDITIONAL USE - Use for validation',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Extract file list
  if (obj['files'] || obj['Files'] || obj['bestanden']) {
    const files = obj['files'] || obj['Files'] || obj['bestanden'];
    metadata.files = Array.isArray(files) ? files : [files];
    metadata.fileCount = Array.isArray(files) ? files.length : 1;
  }

  // Extract manifest metadata
  if (obj['manifest'] || obj['Manifest']) {
    const manifest = obj['manifest'] || obj['Manifest'];
    if (typeof manifest === 'object' && manifest !== null) {
      metadata.manifest = manifest;
    }
  }

  return metadata;
}

/**
 * Extract metadata from pakbon.xml
 * 
 * Purpose: Package manifest/receipt
 * Use Cases:
 * - Package validation
 * - Package metadata
 * - Package provenance
 * 
 * Decision: ⚠️ CONDITIONAL USE - Use for package validation
 */
export function extractPakbonMetadata(parsed: unknown): ExtractedMetadata {
  const metadata: ExtractedMetadata = {
    source: 'pakbon.xml',
    purpose: 'Package manifest/receipt',
    useCase: 'Package validation, package metadata, package provenance',
    decision: 'CONDITIONAL USE - Use for package validation',
  };

  if (typeof parsed !== 'object' || parsed === null) {
    return metadata;
  }

  const obj = parsed as Record<string, unknown>;

  // Extract pakbon data
  if (obj['pakbon'] || obj['Pakbon']) {
    const pakbon = obj['pakbon'] || obj['Pakbon'];
    if (typeof pakbon === 'object' && pakbon !== null) {
      const pakbonObj = pakbon as Record<string, unknown>;
      
      if (pakbonObj['versie'] || pakbonObj['Versie']) {
        metadata.versie = pakbonObj['versie'] || pakbonObj['Versie'];
      }
      if (pakbonObj['datum'] || pakbonObj['Datum']) {
        metadata.datum = pakbonObj['datum'] || pakbonObj['Datum'];
      }
      if (pakbonObj['inhoud'] || pakbonObj['Inhoud']) {
        metadata.inhoud = pakbonObj['inhoud'] || pakbonObj['Inhoud'];
      }
      
      metadata.full = pakbonObj;
    }
  }

  return metadata;
}

/**
 * Route to appropriate extractor based on filename
 */
export function extractMetadataByFileType(filename: string, parsed: unknown): ExtractedMetadata {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.includes('identificatie.xml')) {
    return extractIdentificatieMetadata(parsed);
  }
  
  if (lowerFilename.includes('metadata.xml') && !lowerFilename.includes('versie')) {
    return extractRegelingMetadata(parsed);
  }
  
  if (lowerFilename.includes('versiemetadata.xml')) {
    return extractVersieMetadata(parsed);
  }
  
  if (lowerFilename.includes('momentopname.xml')) {
    return extractMomentopnameMetadata(parsed);
  }
  
  if (lowerFilename.includes('activiteiten.xml')) {
    return extractActiviteitenMetadata(parsed);
  }
  
  if (lowerFilename.includes('regelsvooriedereen.xml')) {
    return extractRegelsVoorIedereenMetadata(parsed);
  }
  
  if (lowerFilename.includes('regelteksten.xml')) {
    return extractRegeltekstenMetadata(parsed);
  }
  
  if (lowerFilename.includes('ambtsgebieden.xml')) {
    return extractAmbtsgebiedenMetadata(parsed);
  }
  
  if (lowerFilename.includes('regelingsgebieden.xml')) {
    return extractRegelingsgebiedenMetadata(parsed);
  }
  
  if (lowerFilename.includes('manifest-ow.xml')) {
    return extractManifestOwMetadata(parsed);
  }
  
  if (lowerFilename.includes('pakbon.xml')) {
    return extractPakbonMetadata(parsed);
  }

  // Fallback for unknown XML files
  logger.warn({ filename }, 'Unknown XML file type, using generic extraction');
  return {
    source: filename,
    purpose: 'Unknown',
    useCase: 'Generic extraction',
    decision: 'REVIEW NEEDED',
    parsed: parsed,
  };
}

