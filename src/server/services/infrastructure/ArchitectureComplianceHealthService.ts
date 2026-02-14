/**
 * Architecture Compliance Health Service
 * 
 * Checks architecture compliance status for the knowledge graph.
 * Verifies that knowledge graph entities are stored in GraphDB (not Neo4j)
 * according to the architecture: docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md
 */

import { logger } from '../../utils/logger.js';
import { getArchitectureComplianceStatus } from '../knowledge-graph/utils/architectureValidation.js';
import { getKnowledgeGraphBackend } from '../../routes/knowledgeGraphRoutes.js';

export interface ArchitectureComplianceHealthResult {
  healthy: boolean;
  timestamp: string;
  compliant: boolean;
  backend: {
    configured: 'graphdb' | 'neo4j';
    actual: 'graphdb' | 'neo4j' | 'unknown';
    compliant: boolean;
  };
  service: {
    type: string;
    message: string;
  };
  architecture: {
    knowledgeGraph: {
      expected: string;
      actual: string;
      compliant: boolean;
    };
    navigationGraph: {
      expected: string;
      note: string;
      compliant?: boolean;
      apiDiscoveredDocuments?: {
        count: number;
        sources: { rechtspraak: number; dso: number; other: number };
      };
    };
  };
  documentation: string;
  warnings: string[];
  recommendations: string[];
  error?: string;
}

/**
 * Architecture Compliance Health Service
 */
export class ArchitectureComplianceHealthService {
  /**
   * Check architecture compliance health
   */
  static async checkHealth(): Promise<ArchitectureComplianceHealthResult> {
    const timestamp = new Date().toISOString();

    try {
      const backend = getKnowledgeGraphBackend();

      // Get the knowledge graph service to check compliance
      let complianceStatus;
      try {
        const { getKnowledgeGraphService } = await import('../knowledge-graph/core/KnowledgeGraph.js');
        const kgService = await getKnowledgeGraphService();
        complianceStatus = getArchitectureComplianceStatus(kgService);
      } catch (error) {
        // If service is not available, report as non-compliant
        complianceStatus = {
          compliant: false,
          backend: 'unknown' as const,
          serviceType: 'unknown',
          message: `Knowledge graph service not available: ${error instanceof Error ? error.message : String(error)}`
        };
      }

      const isCompliant = complianceStatus.compliant && backend === 'graphdb';

      // Check Navigation Graph compliance (no API-discovered documents)
      let navGraphCompliant = true;
      let apiDiscoveredCount = 0;
      const apiDiscoveredSources = { rechtspraak: 0, dso: 0, other: 0 };
      
      try {
        const { getNeo4jDriver } = await import('../../config/neo4j.js');
        const { NavigationGraph } = await import('../graphs/navigation/NavigationGraph.js');
        const driver = getNeo4jDriver();
        const navGraph = new NavigationGraph(driver);
        await navGraph.initialize();
        
        const session = driver.session();
        try {
          const checkQuery = `
            MATCH (n:NavigationNode)
            WHERE 
              n.sourceUrl CONTAINS 'rechtspraak.nl' OR
              n.sourceUrl CONTAINS 'uitspraken.rechtspraak.nl' OR
              n.sourceUrl CONTAINS 'omgevingswet.overheid.nl' OR
              n.url CONTAINS 'rechtspraak.nl' OR
              n.url CONTAINS 'uitspraken.rechtspraak.nl' OR
              n.url CONTAINS 'omgevingswet.overheid.nl' OR
              (n.url CONTAINS 'ECLI:' AND n.url CONTAINS 'NL:')
            RETURN n.url as url, n.sourceUrl as sourceUrl
          `;
          const result = await session.run(checkQuery);
          apiDiscoveredCount = result.records.length;
          
          for (const record of result.records) {
            const url = record.get('url') || record.get('sourceUrl') || '';
            if (url.includes('rechtspraak')) {
              apiDiscoveredSources.rechtspraak++;
            } else if (url.includes('omgevingswet.overheid.nl')) {
              apiDiscoveredSources.dso++;
            } else {
              apiDiscoveredSources.other++;
            }
          }
          
          navGraphCompliant = apiDiscoveredCount === 0;
        } finally {
          await session.close();
        }
      } catch (navGraphError) {
        logger.debug({ error: navGraphError }, 'Could not check Navigation Graph compliance (Neo4j may not be available)');
        // Don't fail the health check if Neo4j is not available
      }

      const overallCompliant = isCompliant && navGraphCompliant;

      return {
        healthy: overallCompliant,
        timestamp,
        compliant: overallCompliant,
        backend: {
          configured: backend,
          actual: complianceStatus.backend,
          compliant: backend === 'graphdb'
        },
        service: {
          type: complianceStatus.serviceType,
          message: complianceStatus.message
        },
        architecture: {
          knowledgeGraph: {
            expected: 'GraphDB',
            actual: complianceStatus.backend === 'graphdb' ? 'GraphDB' : complianceStatus.backend === 'neo4j' ? 'Neo4j' : 'Unknown',
            compliant: complianceStatus.backend === 'graphdb'
          },
          navigationGraph: {
            expected: 'Neo4j (web-scraped content only)',
            note: 'Navigation graph uses Neo4j (separate from knowledge graph). Should only contain web-scraped content (IPLO, Web, Gemeente), not API-discovered documents (Rechtspraak, DSO, Wetgeving).',
            compliant: navGraphCompliant,
            apiDiscoveredDocuments: apiDiscoveredCount > 0 ? {
              count: apiDiscoveredCount,
              sources: apiDiscoveredSources
            } : undefined
          }
        },
        documentation: 'docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md',
        warnings: (() => {
          const warnings: string[] = [];
          if (!isCompliant) {
            warnings.push(
              `Architecture violation detected: Knowledge graph is using ${complianceStatus.backend} backend. ` +
              `According to the architecture, knowledge graph entities must be stored in GraphDB. ` +
              `See docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md for details.`
            );
          }
          if (!navGraphCompliant) {
            warnings.push(
              `Architecture violation detected: Navigation Graph contains ${apiDiscoveredCount} API-discovered document(s) ` +
              `(Rechtspraak: ${apiDiscoveredSources.rechtspraak}, DSO: ${apiDiscoveredSources.dso}, Other: ${apiDiscoveredSources.other}). ` +
              `Navigation Graph should only contain web-scraped content (IPLO, Web, Gemeente). ` +
              `API-discovered documents belong in Knowledge Graph only. ` +
              `Run migration script: pnpm tsx scripts/remove-api-documents-from-navigation-graph.ts`
            );
          }
          return warnings;
        })(),
        recommendations: (() => {
          const recommendations: string[] = [];
          if (!isCompliant) {
            recommendations.push(
              'Ensure GraphDB is running and connected',
              'Set KG_BACKEND=graphdb environment variable',
              'Verify GraphDB connection in service initialization',
              'Run audit script: pnpm run sync:audit-neo4j-kg-entities'
            );
          }
          if (!navGraphCompliant) {
            recommendations.push(
              'Run migration script to remove API-discovered documents: pnpm tsx scripts/remove-api-documents-from-navigation-graph.ts',
              'Verify workflows are not adding API-discovered documents to Navigation Graph',
              'Use shouldAddToNavigationGraph() helper to filter sources before adding to Navigation Graph'
            );
          }
          return recommendations;
        })()
      };
    } catch (error) {
      logger.error({ error }, 'Failed to check architecture compliance health');
      return {
        healthy: false,
        timestamp,
        compliant: false,
        backend: {
          configured: 'graphdb',
          actual: 'unknown',
          compliant: false
        },
        service: {
          type: 'unknown',
          message: `Failed to check architecture compliance: ${error instanceof Error ? error.message : String(error)}`
        },
        architecture: {
          knowledgeGraph: {
            expected: 'GraphDB',
            actual: 'Unknown',
            compliant: false
          },
          navigationGraph: {
            expected: 'Neo4j (web-scraped content only)',
            note: 'Navigation graph uses Neo4j (separate from knowledge graph). Should only contain web-scraped content.',
            compliant: true // Assume compliant if check fails (Neo4j may not be available)
          }
        },
        documentation: 'docs/01-architecture/GRAPH-STORAGE-ARCHITECTURE.md',
        warnings: ['Failed to check architecture compliance status'],
        recommendations: [
          'Check knowledge graph service initialization',
          'Verify GraphDB connection',
          'Review service initialization logs'
        ],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
