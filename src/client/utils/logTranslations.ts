import { t } from './i18n.js';

const stepNameTranslations: Record<string, string> = {
  'Save Navigation Graph': t('workflowSteps.saveNavigationGraph'),
  'Initialize Navigation Graph': t('workflowSteps.initializeNavigationGraph'),
  'Explore IPLO': t('workflowSteps.exploreIPLO'),
  'Enhance Query with IMBOR': t('workflowSteps.enhanceQueryWithImbor'),
  'Scan IPLO': t('workflowSteps.scanIPLO'),
  'Scan Known Sources': t('workflowSteps.scanKnownSources'),
  'Cross-reference with Google': t('workflowSteps.crossReferenceWithGoogle'),
  'Score and Filter Documents': t('workflowSteps.scoreAndFilterDocuments'),
  'Explore External Links': t('workflowSteps.exploreExternalLinks'),
  'Explore Discovered Websites': t('workflowSteps.exploreDiscoveredWebsites'),
  'Create Relevant Subgraph': t('workflowSteps.createRelevantSubgraph'),
  'Expand from Relevant Nodes': t('workflowSteps.expandFromRelevantNodes'),
  'Merge Results into Main Graph': t('workflowSteps.mergeResultsIntoMainGraph'),
  'Save Results': t('workflowSteps.saveResults'),
  'Find Relevant Nodes in Existing Graph': t('workflowSteps.findRelevantNodes'),
  'Find Starting Node': t('workflowSteps.findStartingNode'),
  'BFS Explore 3 Hops': t('workflowSteps.bfsExplore3Hops'),
  'Scrape Horst aan de Maas Municipality': t('workflowSteps.scrapeHorstMunicipality'),
  'Scrape Horst aan de Maas Municipality (Arbeidsmigratie)': t('workflowSteps.scrapeHorstMunicipalityArbeidsmigratie'),
  'Scan IPLO for Arbeidsmigratie': t('workflowSteps.scanIPLOForArbeidsmigratie'),
  'Scan IPLO for Known Subjects': t('workflowSteps.scanIPLOForKnownSubjects'),
  'scan iplo for known subjects': t('workflowSteps.scanIPLOForKnownSubjects'), // Lowercase variant
  'Targeted Google Search (Gemeente + IPLO)': t('workflowSteps.targetedGoogleSearch'),
  'BFS Crawl from Discovered URLs': t('workflowSteps.bfsCrawlFromDiscoveredUrls'),
  'Explore IPLO with Semantic Targeting': t('workflowSteps.exploreIPLOWithSemanticTargeting'),
  'Search DSO by Location': 'DSO zoeken op locatie'
};

const workflowNameTranslations: Record<string, string> = {
  'IPLO Exploration': t('workflows.iploExploration.name'),
  'Standard Document Scan': t('workflows.standardScan.name'),
  'Quick IPLO Scan': t('workflows.quickIploScan.name'),
  '3-Hop BFS Test': t('workflows.bfs3Hop.name'),
  'External Links Exploration': t('workflows.externalLinks.name'),
  'Beleidsscan Navigation Graph': t('workflows.beleidsscanGraph.name'),
  'Horst aan de Maas Workflow': t('workflows.horstAanDeMaas.name'),
  'Horst Labor Migration': t('workflows.horstLaborMigration.name')
};

export function translateStepName(stepName: string): string {
  // Try exact match first
  if (stepNameTranslations[stepName]) {
    return stepNameTranslations[stepName];
  }
  // Try case-insensitive match
  const lowerStepName = stepName.toLowerCase();
  for (const [key, value] of Object.entries(stepNameTranslations)) {
    if (key.toLowerCase() === lowerStepName) {
      return value;
    }
  }
  // Return original if no match found
  return stepName;
}

export function translateWorkflowName(workflowName: string): string {
  return workflowNameTranslations[workflowName] || workflowName;
}

/**
 * Convert a translation key to human-readable text
 * Example: "workflowLogs.processingItems" -> "Processing Items"
 */
function keyToReadableText(key: string): string {
  // Remove "workflowLogs." prefix if present
  const keyWithoutPrefix = key.replace(/^workflowLogs?\./i, '');
  
  // Split by dots and convert camelCase to "Readable Text"
  const parts = keyWithoutPrefix.split('.');
  const readableParts = parts.map(part => {
    // Convert camelCase to "Camel Case"
    return part
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before capital letters
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // Handle consecutive capitals
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  });
  
  return readableParts.join(' ');
}

// Removed unused translation functions and rules - logs are now in Dutch directly

/**
 * Check if a message is meaningless and should be filtered out
 * Since logs are now in Dutch directly, we only filter empty messages
 */
function isMeaninglessMessage(message: string): boolean {
  const trimmed = message.trim();
  // Only filter truly empty messages
  return trimmed.length === 0;
}

export function translateLogMessage(message: string): string {
  // Workflow logs are now generated directly in Dutch - no translation needed
  // Just return the message as-is, filtering out meaningless messages
  const trimmedMessage = message.trim();
  
  // Filter out meaningless messages early
  if (isMeaninglessMessage(trimmedMessage)) {
    return ''; // Return empty string to hide these messages
  }
  
  // Strip any leading ?? prefix (with optional whitespace) that might have been accidentally added
  const cleanedMessage = trimmedMessage.replace(/^\?\?\s*/, '');
  
  // Return message as-is (already in Dutch)
  return cleanedMessage;
}

// translateSingleI18nMessage removed - logs are now in Dutch directly, no translation needed
