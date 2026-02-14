import { Workflow } from '../services/infrastructure/types.js';

/**
 * Exploration Workflow
 * Used in Dev Mode to explore IPLO and build the navigation graph
 */
export const explorationWorkflow: Workflow = {
    id: 'iplo-exploration',
    name: 'IPLO Exploration',
    description: 'Explore IPLO website to build navigation graph and save content as Markdown',
    steps: [
        {
            id: 'init-graph',
            name: 'Initialize Navigation Graph',
            action: 'load_graph',
            next: 'explore-iplo'
        },
        {
            id: 'explore-iplo',
            name: 'Explore IPLO',
            action: 'explore_iplo',
            params: {
                maxDepth: 2
            },
            next: 'save-graph'
        },
        {
            id: 'save-graph',
            name: 'Save Navigation Graph',
            action: 'save_graph'
        }
    ]
};

/**
 * Standard Scan Workflow
 * Used in Prod Mode to scan for documents based on a query
 */
export const standardScanWorkflow: Workflow = {
    id: 'standard-scan',
    name: 'Standard Document Scan',
    description: 'Scan IPLO, known sources, and Google for relevant documents',
    steps: [
        {
            id: 'enhance-query',
            name: 'Enhance Query with IMBOR',
            action: 'enhance_with_imbor',
            next: 'scan-iplo'
        },
        {
            id: 'scan-iplo',
            name: 'Scan IPLO',
            action: 'scan_iplo',
            next: 'scan-known-sources'
        },
        {
            id: 'scan-known-sources',
            name: 'Scan Known Sources',
            action: 'scan_known_sources',
            next: 'scan-google'
        },
        {
            id: 'scan-google',
            name: 'Cross-reference with Google',
            action: 'scan_google',
            next: 'score-documents'
        },
        {
            id: 'score-documents',
            name: 'Score and Filter Documents',
            action: 'RankResults',
            params: {
                useSemanticSearch: true,
                topK: 50
            }
        }
    ]
};

/**
 * Quick IPLO Scan Workflow
 * Lightweight workflow for quick IPLO-only scans
 * 
 * Flow:
 * 1. Scan IPLO for known subjects - automatically selects hardcoded IPLO subjects (bodem, water, etc.),
 *    enhances each with IMBOR, and scans IPLO for documents
 * 2. Score and rank all collected documents
 * 
 * Known IPLO subjects scanned (hardcoded):
 * - bodem, water, ruimtelijke ordening, bouwen, wonen, milieu, geluid,
 *   externe veiligheid, energie, natuur, klimaat
 * 
 * No parameters required - workflow automatically processes all known subjects.
 * Optional: Can override subjects via 'subjects' param (array of strings).
 */
export const quickIploScanWorkflow: Workflow = {
    id: 'quick-iplo-scan',
    name: 'Quick IPLO Scan',
    description: 'Fast scan of IPLO for known subjects (bodem, water, etc.) with query enhancement',
    steps: [
        {
            id: 'scan-iplo-subjects',
            name: 'Scan IPLO for Known Subjects',
            action: 'scan_iplo_known_subjects',
            // Automatically selects known IPLO subjects, enhances each with IMBOR, and scans
            // Optional: Can pass 'subjects' param to override the default list
            next: 'score-documents'
        },
        {
            id: 'score-documents',
            name: 'Score and Filter Documents',
            action: 'RankResults',
            params: {
                useSemanticSearch: true,
                topK: 50
            }
        }
    ]
};

/**
 * External Links Exploration Workflow
 * Explores external links from IPLO pages and adds them to navigation graph only
 * Does NOT add to knowledge graph - just tracks what external resources IPLO links to
 */
export const externalLinksWorkflow: Workflow = {
    id: 'external-links-exploration',
    name: 'External Links Exploration',
    description: 'Explore external links from IPLO pages and add them to navigation graph (not knowledge graph)',
    steps: [
        {
            id: 'init-graph',
            name: 'Initialize Navigation Graph',
            action: 'load_graph',
            next: 'explore-external-links'
        },
        {
            id: 'explore-external-links',
            name: 'Explore External Links',
            action: 'explore_external_links',
            params: {
                maxExternalLinks: 100
            },
            next: 'save-graph'
        },
        {
            id: 'save-graph',
            name: 'Save Navigation Graph',
            action: 'save_graph'
        }
    ]
};

/**
 * 3-Hop BFS Test Workflow
 * Starts from a single node and does breadth-first search 3 hops deep
 */
export const bfs3HopWorkflow: Workflow = {
    id: 'bfs-3-hop',
    name: '3-Hop BFS Test',
    description: 'Breadth-first search from a single node, 3 hops deep',
    steps: [
        {
            id: 'init-graph',
            name: 'Initialize Navigation Graph',
            action: 'init_navigation_graph',
            next: 'find-start-node'
        },
        {
            id: 'find-start-node',
            name: 'Find Starting Node',
            action: 'find_start_node',
            next: 'bfs-explore'
        },
        {
            id: 'bfs-explore',
            name: 'BFS Explore 3 Hops',
            action: 'bfs_explore_3_hops',
            next: 'save-results'
        },
        {
            id: 'save-results',
            name: 'Save Results',
            action: 'save_scan_results'
        }
    ]
};

/**
 * Beleidsscan Navigation Graph Workflow
 * Finds relevant nodes in existing graph, displays subgraph, then expands
 */
export const beleidsscanGraphWorkflow: Workflow = {
    id: 'beleidsscan-graph',
    name: 'Beleidsscan Navigation Graph',
    description: 'Find relevant nodes, display subgraph, then expand navigation graph in real-time',
    steps: [
        {
            id: 'init-graph',
            name: 'Initialize Navigation Graph',
            action: 'init_navigation_graph',
            next: 'find-relevant-nodes'
        },
        {
            id: 'find-relevant-nodes',
            name: 'Find Relevant Nodes in Existing Graph',
            action: 'find_relevant_nodes',
            next: 'create-subgraph'
        },
        {
            id: 'create-subgraph',
            name: 'Create Relevant Subgraph',
            action: 'create_relevant_subgraph',
            next: 'expand-from-nodes'
        },
        {
            id: 'expand-from-nodes',
            name: 'Expand from Relevant Nodes',
            action: 'expand_from_relevant_nodes',
            next: 'explore-discovered'
        },
        {
            id: 'explore-discovered',
            name: 'Explore Discovered Websites',
            action: 'explore_discovered_websites',
            next: 'merge-results'
        },
        {
            id: 'merge-results',
            name: 'Merge Results into Main Graph',
            action: 'merge_into_main_graph',
            next: 'save-results'
        },
        {
            id: 'save-results',
            name: 'Save Results',
            action: 'save_scan_results'
        }
    ]
};

/**
 * Horst aan de Maas Workflow
 * Scrapes Horst aan de Maas municipality website and relevant IPLO websites
 * Uses BFS strategy to crawl both sources
 */
export const horstAanDeMaasWorkflow: Workflow = {
    id: 'horst-aan-de-maas',
    name: 'Horst aan de Maas Workflow',
    description: 'Scrape Horst aan de Maas municipality and relevant IPLO websites using BFS strategy',
    steps: [
        {
            id: 'init-graph',
            name: 'Initialize Navigation Graph',
            action: 'init_navigation_graph',
            next: 'scrape-horst-municipality'
        },
        {
            id: 'scrape-horst-municipality',
            name: 'Scrape Horst aan de Maas Municipality',
            action: 'scrape_horst_municipality',
            next: 'explore-iplo-semantic'
        },
        {
            id: 'explore-iplo-semantic',
            name: 'Explore IPLO with Semantic Targeting',
            action: 'explore_iplo',
            params: {
                maxDepth: 3,
                randomness: 0.1
            },
            next: 'bfs-crawl'
        },
        {
            id: 'bfs-crawl',
            name: 'BFS Crawl from Discovered URLs',
            action: 'bfs_crawl_websites',
            next: 'save-results'
        },
        {
            id: 'save-results',
            name: 'Save Results',
            action: 'save_scan_results'
        }
    ]
};

/**
 * Horst Labor Migration Workflow
 * Targeted scan for "arbeidsmigratie" within Gemeente Horst aan de Maas
 * Combines municipality scraper, IPLO scan, targeted Google search, and BFS crawl
 */
export const horstLaborMigrationWorkflow: Workflow = {
    id: 'horst-labor-migration',
    name: 'Horst Labor Migration',
    description: 'Targeted workflow for arbeidsmigratie in Horst aan de Maas (IPLO + gemeente + Google)',
    steps: [
        {
            id: 'init-graph',
            name: 'Initialize Navigation Graph',
            action: 'init_navigation_graph',
            next: 'scrape-horst-municipality'
        },
        {
            id: 'scrape-horst-municipality',
            name: 'Scrape Horst aan de Maas Municipality (Arbeidsmigratie)',
            action: 'scrape_horst_municipality',
            params: {
                onderwerp: 'arbeidsmigratie',
                thema: 'arbeidsmigranten'
            },
            next: 'scan-iplo-topic'
        },
        {
            id: 'scan-iplo-topic',
            name: 'Scan IPLO for Arbeidsmigratie',
            action: 'scan_iplo',
            params: {
                query: 'arbeidsmigratie horst aan de maas',
                theme: 'arbeidsmigranten'
            },
            next: 'google-targeted'
        },
        {
            id: 'google-targeted',
            name: 'Targeted Google Search (Gemeente + IPLO)',
            action: 'google_search_topic',
            params: {
                query: 'arbeidsmigratie horst aan de maas',
                siteRestrict: [
                    'horstaandemaas.nl',
                    'horstaandemaas2040.nl',
                    'iplo.nl',
                    'officielebekendmakingen.nl',
                    'rijksoverheid.nl'
                ],
                numResults: 12
            },
            next: 'bfs-crawl'
        },
        {
            id: 'bfs-crawl',
            name: 'BFS Crawl from Discovered URLs',
            action: 'bfs_crawl_websites',
            params: {
                onderwerp: 'arbeidsmigratie'
            },
            next: 'save-results'
        },
        {
            id: 'save-results',
            name: 'Save Results',
            action: 'save_scan_results'
        }
    ]
};

/**
 * Beleidsscan Wizard Workflow
 * Comprehensive discovery workflow for the Beleidsscan wizard
 * Discovers policy documents across DSO, IPLO, municipality websites,
 * official publications, jurisprudence, and optionally Common Crawl
 */
export const beleidsscanWizardWorkflow: Workflow = {
    id: 'beleidsscan-wizard',
    name: 'Beleidsscan Wizard Workflow',
    description: 'Comprehensive and production-grade discovery workflow for the Beleidsscan wizard',
    steps: [
        // Phase 1: Core Discovery
        {
            id: 'search-dso-discovery',
            name: 'Search DSO Omgevingsdocumenten (Discovery)',
            action: 'fetch_dso_documents_by_geometry',
            next: 'enrich-dso-optional'
        },
        {
            id: 'enrich-dso-optional',
            name: 'Enrich DSO Documents (Optional)',
            action: 'enrich_dso_documents_optional',
            next: 'search-iplo'
        },
        {
            id: 'search-iplo',
            name: 'Search IPLO Documents',
            action: 'search_iplo_documents',
            next: 'scan-known-sources'
        },
        {
            id: 'scan-known-sources',
            name: 'Scan Selected Websites',
            action: 'scan_known_sources',
            next: 'normalize-deduplicate-core'
        },
        {
            id: 'normalize-deduplicate-core',
            name: 'Normalize and Deduplicate Core Documents',
            action: 'normalize_deduplicate_core',
            next: 'search-officielebekendmakingen'
        },
        
        // Phase 2: Additional Structured Sources
        {
            id: 'search-officielebekendmakingen',
            name: 'Search Official Publications',
            action: 'search_officielebekendmakingen',
            next: 'search-rechtspraak'
        },
        {
            id: 'search-rechtspraak',
            name: 'Search Jurisprudence',
            action: 'search_rechtspraak',
            next: 'search-common-crawl-optional'
        },
        
        // Phase 3: Optional Deep Discovery
        {
            id: 'search-common-crawl-optional',
            name: 'Optional Deep Discovery (Common Crawl)',
            action: 'search_common_crawl_optional',
            next: 'merge-score-categorize'
        },
        
        // Phase 4: Merge, Score, and Categorize
        {
            id: 'merge-score-categorize',
            name: 'Merge + Score + Categorize',
            action: 'merge_score_categorize',
            next: 'verify-persistence'
        },
        
        // Phase 5: Save Results
        {
            id: 'verify-persistence',
            name: 'Verify Document Persistence',
            action: 'save_all_workflow_documents',
            next: 'save-results'
        },
        {
            id: 'save-results',
            name: 'Save Navigation Graph Results',
            action: 'save_scan_results'
        }
    ]
};

/**
 * Beleidsscan Wizard Step Workflows
 * Individual workflows for each step of the beleidsscan wizard
 * Each workflow accepts subject (onderwerp) and location (overheidsinstantie) parameters
 */

/**
 * Step 1: Search DSO Omgevingsdocumenten (Discovery)
 */
export const beleidsscanStep1SearchDsoWorkflow: Workflow = {
    id: 'beleidsscan-step-1-search-dso',
    name: 'Beleidsscan Step 1: Search DSO Omgevingsdocumenten',
    description: 'Search DSO Omgevingsdocumenten for policy documents (Discovery phase)',
    steps: [
        {
            id: 'search-dso-discovery',
            name: 'Search DSO Omgevingsdocumenten (Discovery)',
            action: 'fetch_dso_documents_by_geometry'
        }
    ]
};

/**
 * Step 2: Enrich DSO Documents (Optional)
 */
/**
 * Step 2: Enrich DSO Documents Workflow
 * 
 * Enriches DSO documents with additional metadata from the DSO Enrichment API.
 * 
 * Supports standalone execution by providing `dsoDiscoveryDocuments` parameter:
 * - If `dsoDiscoveryDocuments` is provided, uses those documents (standalone mode)
 * - If not provided, uses documents from workflow context (Step 1 → Step 2 flow)
 * 
 * @example Standalone execution:
 * ```typescript
 * await workflowEngine.startWorkflow(beleidsscanStep2EnrichDsoWorkflow, {
 *   dsoDiscoveryDocuments: [...], // Mock/seed documents
 *   enableEnrichment: true,
 *   enrichmentTopK: 10
 * });
 * ```
 */
export const beleidsscanStep2EnrichDsoWorkflow: Workflow = {
    id: 'beleidsscan-step-2-enrich-dso',
    name: 'Beleidsscan Step 2: Enrich DSO Documents',
    description: 'Enrich DSO documents with additional metadata (Optional). Supports standalone execution via dsoDiscoveryDocuments parameter.',
    steps: [
        {
            id: 'enrich-dso-optional',
            name: 'Enrich DSO Documents (Optional)',
            action: 'enrich_dso_documents_optional'
        }
    ]
};

/**
 * Step 3: Search IPLO Documents
 */
export const beleidsscanStep3SearchIploWorkflow: Workflow = {
    id: 'beleidsscan-step-3-search-iplo',
    name: 'Beleidsscan Step 3: Search IPLO Documents',
    description: 'Search IPLO for relevant policy documents',
    steps: [
        {
            id: 'search-iplo',
            name: 'Search IPLO Documents',
            action: 'search_iplo_documents'
        }
    ]
};

/**
 * Step 4: Scan Selected Websites
 */
export const beleidsscanStep4ScanKnownSourcesWorkflow: Workflow = {
    id: 'beleidsscan-step-4-scan-sources',
    name: 'Beleidsscan Step 4: Scan Selected Websites',
    description: 'Scan selected municipality and government websites for documents',
    steps: [
        {
            id: 'scan-known-sources',
            name: 'Scan Selected Websites',
            action: 'scan_known_sources'
        }
    ]
};

/**
 * Step 5: Search Official Publications
 */
export const beleidsscanStep5SearchOfficieleBekendmakingenWorkflow: Workflow = {
    id: 'beleidsscan-step-5-officiele-bekendmakingen',
    name: 'Beleidsscan Step 5: Search Official Publications',
    description: 'Search Officiele Bekendmakingen for official government publications',
    steps: [
        {
            id: 'search-officielebekendmakingen',
            name: 'Search Official Publications',
            action: 'search_officielebekendmakingen'
        }
    ]
};

/**
 * Step 6: Search Jurisprudence
 */
export const beleidsscanStep6SearchRechtspraakWorkflow: Workflow = {
    id: 'beleidsscan-step-6-rechtspraak',
    name: 'Beleidsscan Step 6: Search Jurisprudence',
    description: 'Search Rechtspraak.nl for relevant legal decisions and jurisprudence',
    steps: [
        {
            id: 'search-rechtspraak',
            name: 'Search Jurisprudence',
            action: 'search_rechtspraak'
        }
    ]
};

/**
 * Step 7: Optional Deep Discovery (Common Crawl)
 */
export const beleidsscanStep7CommonCrawlWorkflow: Workflow = {
    id: 'beleidsscan-step-7-common-crawl',
    name: 'Beleidsscan Step 7: Optional Deep Discovery (Common Crawl)',
    description: 'Optional deep discovery using Common Crawl for additional document sources',
    steps: [
        {
            id: 'search-common-crawl-optional',
            name: 'Optional Deep Discovery (Common Crawl)',
            action: 'search_common_crawl_optional'
        }
    ]
};

/**
 * Step 9: Merge + Score + Categorize
 */
export const beleidsscanStep9MergeScoreWorkflow: Workflow = {
    id: 'beleidsscan-step-9-merge-score',
    name: 'Beleidsscan Step 9: Merge + Score + Categorize',
    description: 'Merge results from all sources, score relevance, and categorize documents',
    steps: [
        {
            id: 'merge-score-categorize',
            name: 'Merge + Score + Categorize',
            action: 'merge_score_categorize'
        }
    ]
};

/**
 * DSO Location-Based Document Search Workflow
 * 
 * Fetches all omgevingsdocumenten from the DSO for a specific location.
 * Uses the /documenten/_zoek endpoint with geometry-based queries.
 * 
 * Default location: Europalaan 6D, 's-Hertogenbosch (Ruimtemeesters office)
 * 
 * Expected documents for 's-Hertogenbosch:
 * - Omgevingsvisie gemeente 's-Hertogenbosch
 * - Omgevingsplan gemeente 's-Hertogenbosch
 * - Various bestemmingsplannen and voorbereidingsbesluiten
 */
export const dsoLocationSearchWorkflow: Workflow = {
    id: 'dso-location-search',
    name: 'DSO Location-Based Document Search',
    description: "Fetch all omgevingsdocumenten applicable to a specific location via the DSO API (default: Europalaan 6D, 's-Hertogenbosch)",
    steps: [
        {
            id: 'search-dso-location',
            name: 'Search DSO by Location',
            action: 'search_dso_location',
            params: {
                // Default to Europalaan 6D, 's-Hertogenbosch
                // Can be overridden by workflow params
            }
        }
    ]
};

/**
 * All predefined workflows (excluding benchmark workflows)
 * 
 * This array contains all workflows that should be discoverable via the /api/workflows endpoint.
 * Benchmark workflows (single-step workflows for performance testing) are intentionally excluded.
 * 
 * When adding a new predefined workflow:
 * 1. Export it as a named constant above
 * 2. Add it to this array
 * 3. Update E2E tests in tests/e2e/workflow-discoverability.e2e.spec.ts
 */
export const allPredefinedWorkflows: Workflow[] = [
    explorationWorkflow,
    standardScanWorkflow,
    quickIploScanWorkflow,
    bfs3HopWorkflow,
    externalLinksWorkflow,
    beleidsscanWizardWorkflow,
    beleidsscanGraphWorkflow,
    horstAanDeMaasWorkflow,
    horstLaborMigrationWorkflow,
    // Beleidsscan wizard step workflows
    beleidsscanStep1SearchDsoWorkflow,
    beleidsscanStep2EnrichDsoWorkflow,
    beleidsscanStep3SearchIploWorkflow,
    beleidsscanStep4ScanKnownSourcesWorkflow,
    beleidsscanStep5SearchOfficieleBekendmakingenWorkflow,
    beleidsscanStep6SearchRechtspraakWorkflow,
    beleidsscanStep7CommonCrawlWorkflow,
    beleidsscanStep9MergeScoreWorkflow,
    // DSO location-based search workflow
    dsoLocationSearchWorkflow,
];
