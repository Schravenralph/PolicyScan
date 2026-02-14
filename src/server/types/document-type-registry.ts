/**
 * Document Type Registry
 * 
 * Centralized registry for document type hierarchy, mappings, and processing strategies.
 * 
 * @see docs/analysis/document-type-hierarchy.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/08-strategic-canonization-plan.md
 */

import type { DocumentFamily } from '../contracts/types.js';

/**
 * Document format enumeration
 */
export type DocumentFormat = 'PDF' | 'Web' | 'XML' | 'DOCX' | 'JSON' | 'GeoJSON' | 'Shapefile' | 'ZIP' | 'Other';

/**
 * Document type definition
 */
export interface DocumentTypeDefinition {
  /** Canonical name (lowercase, hyphenated) */
  canonicalName: string;
  /** Full hierarchy path */
  hierarchyPath: string[];
  /** Document family */
  documentFamily: DocumentFamily;
  /** Category (e.g., 'DSODocument', 'LegalDocument') */
  category?: string;
  /** Alternative names/variations */
  aliases: string[];
  /** Patterns for type detection */
  sourcePatterns?: {
    url?: RegExp[];
    title?: RegExp[];
    metadata?: string[];
  };
  /** Processing strategy identifier */
  processingStrategy?: string;
  /** Supported formats for this type */
  supportedFormats?: DocumentFormat[];
  /** Typical document structure */
  typicalStructure?: 'singleton' | 'bundle';
}

/**
 * Document type hierarchy information
 */
export interface DocumentTypeHierarchy {
  family: DocumentFamily;
  category?: string;
  type: string;
  fullPath: string;
}

/**
 * Document Type Registry
 * 
 * Maps canonical document type names to their definitions.
 */
export const DOCUMENT_TYPE_REGISTRY: Record<string, DocumentTypeDefinition> = {
  // ============================================================================
  // DSO Documents (Omgevingsinstrument)
  // ============================================================================
  'omgevingsplan': {
    canonicalName: 'omgevingsplan',
    hierarchyPath: ['Document', 'GovernmentDocument', 'DSODocument', 'Omgevingsplan'],
    documentFamily: 'Omgevingsinstrument',
    category: 'DSODocument',
    aliases: ['omgevingsplan', 'omgevingsplanregels'],
    sourcePatterns: {
      url: [/omgevingsplan/i],
      title: [/omgevingsplan/i],
      metadata: ['IMRO', 'IMOW'],
    },
    processingStrategy: 'dso-structured',
    typicalStructure: 'bundle',
    supportedFormats: ['ZIP', 'XML', 'PDF'],
  },
  'omgevingsvisie': {
    canonicalName: 'omgevingsvisie',
    hierarchyPath: ['Document', 'GovernmentDocument', 'DSODocument', 'Omgevingsvisie'],
    documentFamily: 'Omgevingsinstrument',
    category: 'DSODocument',
    aliases: ['omgevingsvisie'],
    sourcePatterns: {
      url: [/omgevingsvisie/i],
      title: [/omgevingsvisie/i],
    },
    processingStrategy: 'dso-structured',
    typicalStructure: 'bundle',
    supportedFormats: ['ZIP', 'XML', 'PDF'],
  },
  'omgevingsprogramma': {
    canonicalName: 'omgevingsprogramma',
    hierarchyPath: ['Document', 'GovernmentDocument', 'DSODocument', 'Omgevingsprogramma'],
    documentFamily: 'Omgevingsinstrument',
    category: 'DSODocument',
    aliases: ['omgevingsprogramma', 'programma'],
    sourcePatterns: {
      url: [/omgevingsprogramma/i],
      title: [/omgevingsprogramma/i],
    },
    processingStrategy: 'dso-structured',
    typicalStructure: 'bundle',
    supportedFormats: ['ZIP', 'XML', 'PDF'],
  },
  'omgevingsverordening': {
    canonicalName: 'omgevingsverordening',
    hierarchyPath: ['Document', 'GovernmentDocument', 'DSODocument', 'Omgevingsverordening'],
    documentFamily: 'Omgevingsinstrument',
    category: 'DSODocument',
    aliases: ['omgevingsverordening'],
    processingStrategy: 'dso-structured',
    typicalStructure: 'bundle',
    supportedFormats: ['ZIP', 'XML', 'PDF'],
  },
  'voorbereidingsbesluit': {
    canonicalName: 'voorbereidingsbesluit',
    hierarchyPath: ['Document', 'GovernmentDocument', 'DSODocument', 'Voorbereidingsbesluit'],
    documentFamily: 'Omgevingsinstrument',
    category: 'DSODocument',
    aliases: ['voorbereidingsbesluit'],
    processingStrategy: 'dso-structured',
    typicalStructure: 'bundle',
    supportedFormats: ['ZIP', 'XML', 'PDF'],
  },
  'projectbesluit': {
    canonicalName: 'projectbesluit',
    hierarchyPath: ['Document', 'GovernmentDocument', 'DSODocument', 'Projectbesluit'],
    documentFamily: 'Omgevingsinstrument',
    category: 'DSODocument',
    aliases: ['projectbesluit'],
    processingStrategy: 'dso-structured',
    typicalStructure: 'bundle',
    supportedFormats: ['ZIP', 'XML', 'PDF'],
  },
  'bestemmingsplan': {
    canonicalName: 'bestemmingsplan',
    hierarchyPath: ['Document', 'GovernmentDocument', 'DSODocument', 'Bestemmingsplan'],
    documentFamily: 'Omgevingsinstrument',
    category: 'DSODocument',
    aliases: ['bestemmingsplan'],
    sourcePatterns: {
      url: [/bestemmingsplan/i],
      title: [/bestemmingsplan/i],
    },
    processingStrategy: 'dso-structured',
    typicalStructure: 'bundle',
    supportedFormats: ['ZIP', 'XML', 'PDF'],
  },

  // ============================================================================
  // Legal Documents (Juridisch)
  // ============================================================================
  'wet': {
    canonicalName: 'wet',
    hierarchyPath: ['Document', 'GovernmentDocument', 'LegalDocument', 'CentralGovtDutchLawDocument', 'Wet'],
    documentFamily: 'Juridisch',
    category: 'CentralGovtDutchLawDocument',
    aliases: ['wet', 'wetten'],
    sourcePatterns: {
      title: [/wet\s+/i],
      metadata: ['BWBR'],
    },
    processingStrategy: 'legal-structured',
    supportedFormats: ['PDF', 'XML', 'Web'],
  },
  'amvb': {
    canonicalName: 'amvb',
    hierarchyPath: ['Document', 'GovernmentDocument', 'LegalDocument', 'CentralGovtDutchLawDocument', 'AMvB'],
    documentFamily: 'Juridisch',
    category: 'CentralGovtDutchLawDocument',
    aliases: ['amvb', 'algemene-maatregel-van-bestuur'],
    processingStrategy: 'legal-structured',
    supportedFormats: ['PDF', 'XML', 'Web'],
  },
  'regeling': {
    canonicalName: 'regeling',
    hierarchyPath: ['Document', 'GovernmentDocument', 'LegalDocument', 'CentralGovtDutchLawDocument', 'Regeling'],
    documentFamily: 'Juridisch',
    category: 'CentralGovtDutchLawDocument',
    aliases: ['regeling'],
    processingStrategy: 'legal-structured',
    supportedFormats: ['PDF', 'XML', 'Web'],
  },
  'verordening': {
    canonicalName: 'verordening',
    hierarchyPath: ['Document', 'GovernmentDocument', 'LegalDocument', 'LocalGovtDutchLawDocument', 'Verordening'],
    documentFamily: 'Juridisch',
    category: 'LocalGovtDutchLawDocument',
    aliases: ['verordening'],
    sourcePatterns: {
      title: [/verordening/i],
    },
    processingStrategy: 'legal-structured',
    supportedFormats: ['PDF', 'XML', 'Web'],
  },
  'beleidsregel': {
    canonicalName: 'beleidsregel',
    hierarchyPath: ['Document', 'GovernmentDocument', 'LegalDocument', 'LocalGovtDutchLawDocument', 'Beleidsregel'],
    documentFamily: 'Juridisch',
    category: 'LocalGovtDutchLawDocument',
    aliases: ['beleidsregel'],
    sourcePatterns: {
      title: [/beleidsregel/i],
    },
    processingStrategy: 'legal-structured',
    supportedFormats: ['PDF', 'XML', 'Web'],
  },
  'besluit': {
    canonicalName: 'besluit',
    hierarchyPath: ['Document', 'GovernmentDocument', 'LegalDocument', 'LocalGovtDutchLawDocument', 'Besluit'],
    documentFamily: 'Juridisch',
    category: 'LocalGovtDutchLawDocument',
    aliases: ['besluit'],
    sourcePatterns: {
      title: [/besluit/i],
    },
    processingStrategy: 'legal-structured',
    supportedFormats: ['PDF', 'XML', 'Web'],
  },
  'uitspraak': {
    canonicalName: 'uitspraak',
    hierarchyPath: ['Document', 'GovernmentDocument', 'LegalDocument', 'ECLIDocument', 'Uitspraak'],
    documentFamily: 'Juridisch',
    category: 'ECLIDocument',
    aliases: ['uitspraak', 'vonnis', 'arrest'],
    sourcePatterns: {
      url: [/ecli/i],
      metadata: ['ECLI'],
    },
    processingStrategy: 'legal-structured',
    supportedFormats: ['XML', 'PDF', 'Web'],
  },

  // ============================================================================
  // Policy Documents (Beleid)
  // ============================================================================
  'beleidsnota': {
    canonicalName: 'beleidsnota',
    hierarchyPath: ['Document', 'GovernmentDocument', 'PolicyDocument', 'Beleidsnota'],
    documentFamily: 'Beleid',
    category: 'PolicyDocument',
    aliases: ['beleidsnota', 'nota'],
    sourcePatterns: {
      title: [/beleidsnota|nota/i],
    },
    processingStrategy: 'policy-generic',
    supportedFormats: ['PDF', 'Web', 'DOCX'],
  },
  'nota': {
    canonicalName: 'nota',
    hierarchyPath: ['Document', 'GovernmentDocument', 'PolicyDocument', 'Beleidsnota'],
    documentFamily: 'Beleid',
    category: 'PolicyDocument',
    aliases: ['nota', 'beleidsnota'],
    sourcePatterns: {
      title: [/nota/i],
    },
    processingStrategy: 'policy-generic',
    supportedFormats: ['PDF', 'Web', 'DOCX'],
  },
  'visiedocument': {
    canonicalName: 'visiedocument',
    hierarchyPath: ['Document', 'GovernmentDocument', 'PolicyDocument', 'Visiedocument'],
    documentFamily: 'Beleid',
    category: 'PolicyDocument',
    aliases: ['visiedocument', 'visie'],
    sourcePatterns: {
      title: [/visie/i],
    },
    processingStrategy: 'policy-generic',
    supportedFormats: ['PDF', 'Web', 'DOCX'],
  },
  'visie': {
    canonicalName: 'visie',
    hierarchyPath: ['Document', 'GovernmentDocument', 'PolicyDocument', 'Visiedocument'],
    documentFamily: 'Beleid',
    category: 'PolicyDocument',
    aliases: ['visie', 'visiedocument'],
    processingStrategy: 'policy-generic',
    supportedFormats: ['PDF', 'Web', 'DOCX'],
  },
  'structuurvisie': {
    canonicalName: 'structuurvisie',
    hierarchyPath: ['Document', 'GovernmentDocument', 'PolicyDocument', 'Structuurvisie'],
    documentFamily: 'Beleid',
    category: 'PolicyDocument',
    aliases: ['structuurvisie'],
    sourcePatterns: {
      title: [/structuurvisie/i],
    },
    processingStrategy: 'policy-generic',
    supportedFormats: ['PDF', 'Web', 'DOCX'],
  },
  'rapport': {
    canonicalName: 'rapport',
    hierarchyPath: ['Document', 'GovernmentDocument', 'PolicyDocument', 'Rapport'],
    documentFamily: 'Beleid',
    category: 'PolicyDocument',
    aliases: ['rapport'],
    sourcePatterns: {
      title: [/rapport/i],
    },
    processingStrategy: 'policy-generic',
    supportedFormats: ['PDF', 'Web', 'DOCX'],
  },
  'beleidsdocument': {
    canonicalName: 'beleidsdocument',
    hierarchyPath: ['Document', 'GovernmentDocument', 'PolicyDocument', 'Beleidsdocument'],
    documentFamily: 'Beleid',
    category: 'PolicyDocument',
    aliases: ['beleidsdocument'],
    processingStrategy: 'policy-generic',
    supportedFormats: ['PDF', 'Web', 'DOCX'],
  },

  // ============================================================================
  // Web Documents (Web)
  // ============================================================================
  'webpagina': {
    canonicalName: 'webpagina',
    hierarchyPath: ['Document', 'GovernmentDocument', 'WebDocument', 'Webpagina'],
    documentFamily: 'Web',
    category: 'WebDocument',
    aliases: ['webpagina', 'webpage', 'page'],
    processingStrategy: 'web-content',
    supportedFormats: ['Web'],
    typicalStructure: 'singleton',
  },
  'webpage': {
    canonicalName: 'webpage',
    hierarchyPath: ['Document', 'GovernmentDocument', 'WebDocument', 'Webpagina'],
    documentFamily: 'Web',
    category: 'WebDocument',
    aliases: ['webpage', 'webpagina', 'page'],
    processingStrategy: 'web-content',
    supportedFormats: ['Web'],
    typicalStructure: 'singleton',
  },
  'landing-page': {
    canonicalName: 'landing-page',
    hierarchyPath: ['Document', 'GovernmentDocument', 'WebDocument', 'LandingPage'],
    documentFamily: 'Web',
    category: 'WebDocument',
    aliases: ['landingpage', 'landing-page', 'startpagina'],
    processingStrategy: 'web-content',
    supportedFormats: ['Web'],
    typicalStructure: 'singleton',
  },
  'faq': {
    canonicalName: 'faq',
    hierarchyPath: ['Document', 'GovernmentDocument', 'WebDocument', 'FAQ'],
    documentFamily: 'Web',
    category: 'WebDocument',
    aliases: ['faq', 'veelgestelde-vragen', 'vragen-en-antwoorden'],
    processingStrategy: 'web-content',
    supportedFormats: ['Web'],
    typicalStructure: 'singleton',
  },
  'news': {
    canonicalName: 'news',
    hierarchyPath: ['Document', 'GovernmentDocument', 'WebDocument', 'NewsArticle'],
    documentFamily: 'Web',
    category: 'WebDocument',
    aliases: ['news', 'nieuws', 'nieuwsbericht'],
    processingStrategy: 'web-content',
    supportedFormats: ['Web'],
    typicalStructure: 'singleton',
  },

  // ============================================================================
  // Geo Documents (Geo)
  // ============================================================================
  'pdok-layer': {
    canonicalName: 'pdok-layer',
    hierarchyPath: ['Document', 'GovernmentDocument', 'MapDocument', 'PDOKDocument', 'PDOKLayer'],
    documentFamily: 'Geo',
    category: 'PDOKDocument',
    aliases: ['pdok-layer', 'kaartlaag'],
    processingStrategy: 'geo-metadata',
    supportedFormats: ['GeoJSON', 'JSON', 'XML'],
  },
  'pdok-service': {
    canonicalName: 'pdok-service',
    hierarchyPath: ['Document', 'GovernmentDocument', 'MapDocument', 'PDOKDocument', 'PDOKService'],
    documentFamily: 'Geo',
    category: 'PDOKDocument',
    aliases: ['pdok-service'],
    processingStrategy: 'geo-metadata',
    supportedFormats: ['XML', 'JSON'],
  },
  'pdok-dataset': {
    canonicalName: 'pdok-dataset',
    hierarchyPath: ['Document', 'GovernmentDocument', 'MapDocument', 'PDOKDocument', 'PDOKDataset'],
    documentFamily: 'Geo',
    category: 'PDOKDocument',
    aliases: ['pdok-dataset'],
    processingStrategy: 'geo-metadata',
    supportedFormats: ['GeoJSON', 'Shapefile', 'ZIP'],
  },
  'workingsgebied': {
    canonicalName: 'workingsgebied',
    hierarchyPath: ['Document', 'GovernmentDocument', 'MapDocument', 'GIODocument', 'Workingsgebied'],
    documentFamily: 'Geo',
    category: 'GIODocument',
    aliases: ['workingsgebied', 'werkingsgebied'],
    processingStrategy: 'geo-metadata',
    supportedFormats: ['GeoJSON', 'JSON'],
  },
  'gio': {
    canonicalName: 'gio',
    hierarchyPath: ['Document', 'GovernmentDocument', 'MapDocument', 'GIODocument'],
    documentFamily: 'Geo',
    category: 'GIODocument',
    aliases: ['gio', 'geografisch-informatie-object'],
    processingStrategy: 'geo-metadata',
    supportedFormats: ['GeoJSON', 'JSON'],
  },

  // ============================================================================
  // Informational Documents (Other)
  // ============================================================================
  'factsheet': {
    canonicalName: 'factsheet',
    hierarchyPath: ['Document', 'InformationalDocument', 'Factsheet'],
    documentFamily: 'Other',
    category: 'InformationalDocument',
    aliases: ['factsheet', 'informatieblad'],
    processingStrategy: 'informational-generic',
    supportedFormats: ['PDF', 'Web'],
    typicalStructure: 'singleton',
  },
  'guide': {
    canonicalName: 'guide',
    hierarchyPath: ['Document', 'InformationalDocument', 'Guide'],
    documentFamily: 'Other',
    category: 'InformationalDocument',
    aliases: ['guide', 'handboek', 'handleiding'],
    processingStrategy: 'informational-generic',
    supportedFormats: ['PDF', 'Web'],
    typicalStructure: 'singleton',
  },
  'summary': {
    canonicalName: 'summary',
    hierarchyPath: ['Document', 'InformationalDocument', 'Summary'],
    documentFamily: 'Other',
    category: 'InformationalDocument',
    aliases: ['summary', 'samenvatting', 'overzicht'],
    processingStrategy: 'informational-generic',
    supportedFormats: ['PDF', 'Web'],
    typicalStructure: 'singleton',
  },
  'research': {
    canonicalName: 'research',
    hierarchyPath: ['Document', 'InformationalDocument', 'ResearchDocument'],
    documentFamily: 'Other',
    category: 'InformationalDocument',
    aliases: ['research', 'onderzoek', 'studie', 'paper'],
    processingStrategy: 'informational-generic',
    supportedFormats: ['PDF', 'Web'],
    typicalStructure: 'singleton',
  },
};

/**
 * Get document type definition from registry
 * 
 * @param type - Document type (canonical name or alias)
 * @returns Document type definition or undefined if not found
 */
export function getDocumentTypeDefinition(type: string): DocumentTypeDefinition | undefined {
  // Try exact match first
  if (DOCUMENT_TYPE_REGISTRY[type]) {
    return DOCUMENT_TYPE_REGISTRY[type];
  }

  // Try case-insensitive match
  const lowerType = type.toLowerCase();
  if (DOCUMENT_TYPE_REGISTRY[lowerType]) {
    return DOCUMENT_TYPE_REGISTRY[lowerType];
  }

  // Try alias match
  for (const [canonicalName, definition] of Object.entries(DOCUMENT_TYPE_REGISTRY)) {
    if (definition.aliases.some(alias => alias.toLowerCase() === lowerType)) {
      return definition;
    }
  }

  return undefined;
}

/**
 * Get document type hierarchy information
 * 
 * @param documentType - Document type (canonical name or alias)
 * @param source - Document source (optional, for fallback)
 * @returns Document type hierarchy or undefined
 */
export function getDocumentTypeHierarchy(
  documentType: string,
  source?: string
): DocumentTypeHierarchy | undefined {
  const definition = getDocumentTypeDefinition(documentType);
  if (!definition) {
    return undefined;
  }

  return {
    family: definition.documentFamily,
    category: definition.category,
    type: definition.canonicalName,
    fullPath: definition.hierarchyPath.join(' > '),
  };
}

/**
 * Map legacy document type to canonical structure
 * 
 * Handles legacy types like 'PDF' (format, not type) and maps them to canonical types.
 * 
 * @param legacyType - Legacy document type
 * @param detectedFormat - Detected format (optional)
 * @returns Mapped document family and type
 */
export function mapLegacyDocumentType(
  legacyType: string,
  detectedFormat?: DocumentFormat
): { documentFamily: DocumentFamily; documentType: string; format?: DocumentFormat } {
  // Handle legacy 'PDF' type - map to format, not type
  if (legacyType === 'PDF') {
    // PDF is a format, not a type - need to infer type from other metadata
    // This is a migration challenge that requires heuristics or manual classification
    return {
      documentFamily: 'Beleid', // Default fallback
      documentType: 'beleidsdocument', // Generic type
      format: 'PDF',
    };
  }

  const definition = getDocumentTypeDefinition(legacyType);
  if (definition) {
    return {
      documentFamily: definition.documentFamily,
      documentType: definition.canonicalName,
      format: detectedFormat,
    };
  }

  // Fallback for unknown types
  return {
    documentFamily: 'Beleid',
    documentType: legacyType.toLowerCase(),
    format: detectedFormat,
  };
}

/**
 * Get processing strategy for document type
 * 
 * @param documentFamily - Document family
 * @param documentType - Document type
 * @returns Processing strategy identifier
 */
export function getProcessingStrategy(
  documentFamily: DocumentFamily,
  documentType: string
): string {
  const definition = getDocumentTypeDefinition(documentType);
  if (definition?.processingStrategy) {
    return definition.processingStrategy;
  }

  // Default strategies by family
  const defaultStrategies: Record<DocumentFamily, string> = {
    Omgevingsinstrument: 'dso-structured',
    Juridisch: 'legal-structured',
    Beleid: 'policy-generic',
    Web: 'web-content',
    Geo: 'geo-metadata',
    Other: 'informational-generic',
  };

  return defaultStrategies[documentFamily] || 'generic';
}

/**
 * Detect document type from metadata
 * 
 * Uses source patterns (URL, title, metadata) to detect document type.
 * 
 * @param metadata - Document metadata
 * @param metadata.url - Document URL
 * @param metadata.title - Document title
 * @param metadata.sourceMetadata - Source metadata
 * @returns Detected document type or undefined
 */
export function detectDocumentType(metadata: {
  url?: string;
  title?: string;
  sourceMetadata?: Record<string, unknown>;
}): string | undefined {
  const { url, title, sourceMetadata } = metadata;

  // Try each registry entry
  for (const [canonicalName, definition] of Object.entries(DOCUMENT_TYPE_REGISTRY)) {
    if (!definition.sourcePatterns) {
      continue;
    }

    const patterns = definition.sourcePatterns;

    // Check URL patterns
    if (patterns.url && url) {
      if (patterns.url.some(regex => regex.test(url))) {
        return canonicalName;
      }
    }

    // Check title patterns
    if (patterns.title && title) {
      if (patterns.title.some(regex => regex.test(title))) {
        return canonicalName;
      }
    }

    // Check metadata patterns
    if (patterns.metadata && sourceMetadata) {
      const metadataStr = JSON.stringify(sourceMetadata).toLowerCase();
      if (patterns.metadata.some(pattern => metadataStr.includes(pattern.toLowerCase()))) {
        return canonicalName;
      }
    }
  }

  return undefined;
}

