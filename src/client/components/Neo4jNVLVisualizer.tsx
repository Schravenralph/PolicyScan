import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { InteractiveNvlWrapper } from '@neo4j-nvl/react';
import type { Node, Relationship } from '@neo4j-nvl/base';
import type { NvlOptions, Layout } from '@neo4j-nvl/base';
import { Database, Loader2, AlertCircle, Filter, Info, BarChart3 } from 'lucide-react';
import { logError } from '../utils/errorHandler';
import { getApiBaseUrl } from '../utils/apiUrl';
import { translateLogMessage } from '../utils/logTranslations';
import { t } from '../utils/i18n';
import { api } from '../services/api';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from './ui/dropdown-menu';

interface KGNodeMetadata {
    domain?: string;
    pagerank?: number;
    betweenness?: number;
    degree?: number;
    communityId?: number;
    eigenvector?: number;
    source?: string;
    domainSource?: string;
    description?: string;
    [key: string]: unknown;
}

interface KGNode {
    id: string;
    type: string;
    name: string;
    description?: string;
    metadata?: KGNodeMetadata;
    [key: string]: unknown;
}

interface KGEdge {
    sourceId: string;
    targetId: string;
    type: string;
    relationTypes?: string[];
    weight?: number;
}

// Neo4j Integer type definition
interface Neo4jInteger {
    toNumber(): number;
    low: number;
    high: number;
}

// Type guard for Neo4j Integer
function isNeo4jInteger(value: unknown): value is Neo4jInteger {
    return (
        value !== null &&
        typeof value === 'object' &&
        'toNumber' in value &&
        typeof (value as Neo4jInteger).toNumber === 'function'
    );
}

// Type for Neo4j Integer with low/high properties (alternative format)
interface Neo4jIntegerLowHigh {
    low: number;
    high: number;
}

function isNeo4jIntegerLowHigh(value: unknown): value is Neo4jIntegerLowHigh {
    return (
        value !== null &&
        typeof value === 'object' &&
        'low' in value &&
        'high' in value &&
        typeof (value as Neo4jIntegerLowHigh).low === 'number' &&
        typeof (value as Neo4jIntegerLowHigh).high === 'number'
    );
}

interface GraphData {
    nodes: KGNode[];
    edges: KGEdge[];
}

/**
 * Extract error message from HTTP response
 * Tries to parse JSON error response and extract the message field
 * Translates [i18n:...] keys if present
 */
async function extractErrorMessage(response: Response, defaultMessage: string): Promise<string> {
    try {
        const errorData = await response.json();
        // Backend error format: { message: string, code: string, ... }
        // Also check nested error.message for compatibility
        let message: string | undefined;
        if (errorData.message) {
            message = errorData.message;
        } else if (errorData.error?.message) {
            message = errorData.error.message;
        } else if (typeof errorData === 'string') {
            message = errorData;
        }
        
        // Translate [i18n:...] keys if present
        if (message) {
            return translateLogMessage(message);
        }
        
        return message || defaultMessage;
    } catch {
        // If JSON parsing fails, use the default error message
    }
    return defaultMessage;
}

/**
 * Neo4j Visualization Library (NVL) Component
 * Uses NVL's InteractiveNvlWrapper for native Neo4j graph visualization
 * with proper depth-based hierarchical layouts
 */
export function Neo4jNVLVisualizer() {
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [backend, setBackend] = useState<'graphdb' | 'neo4j' | null>(null);
    const [kgEnabled, setKgEnabled] = useState(true);
    // Use hierarchical layout by default - CoseBilkent will be used for force-directed
    // Since we're showing clusters (small graphs), CoseBilkent provides better positioning
    const [layout, setLayout] = useState<Layout>('hierarchical');
    // Track expanded clusters - when a cluster is clicked, show its entities
    const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
    const [clusterEntities, setClusterEntities] = useState<KGNode[]>([]);
    const [clusterEntityCount, setClusterEntityCount] = useState<number>(0);
    const [clusterEntitiesPage, setClusterEntitiesPage] = useState<number>(0);
    const [isLoadingEntities, setIsLoadingEntities] = useState<boolean>(false);
    const [selectedEntity, setSelectedEntity] = useState<KGNode | null>(null);
    interface EntityMetadata {
        id?: string;
        name?: string;
        type?: string;
        url?: string;
        error?: string;
        metadata?: KGNodeMetadata;
        relationships?: Array<{ type: string; targetId: string; [key: string]: unknown }>;
        jurisdiction?: string;
        [key: string]: unknown;
    }
    const [entityMetadata, setEntityMetadata] = useState<EntityMetadata | null>(null);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(false);
    const expandedClusterIdRef = useRef<string | null>(null);
    const [domainFilter, setDomainFilter] = useState<string>('ALL'); // Single domain filter (legacy)
    const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set()); // Multi-select domain filter
    const [colorByDomain, setColorByDomain] = useState<boolean>(false); // Toggle domain-based coloring
    const [showLegend, setShowLegend] = useState<boolean>(false); // Show domain legend
    const [showStats, setShowStats] = useState<boolean>(false); // Show domain statistics
    const [showMetricsDashboard, setShowMetricsDashboard] = useState<boolean>(false); // Show GDS metrics dashboard
    const [metricsFilters, setMetricsFilters] = useState<{
        minPageRank?: number;
        minBetweenness?: number;
        minDegree?: number;
        showBottlenecks?: boolean; // Show nodes with high betweenness
    }>({});
    
    const ENTITIES_PER_PAGE = 10; // Show 10 items at a time
    const ENTITIES_TO_RENDER = 10; // Render 10 items per page

    // Fetch graph data from API - use meta endpoint to get communities/clusters
    useEffect(() => {
        let isCancelled = false;
        
        const fetchGraphData = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // Check feature flags first
                try {
                    const flags = await api.workflowConfiguration.getAvailableFeatureFlags();
                    const kgEnabledFlag = flags.find(f => f.name === 'KG_ENABLED');
                    if (kgEnabledFlag && !kgEnabledFlag.currentValue) {
                        if (!isCancelled) {
                            setKgEnabled(false);
                            setIsLoading(false);
                        }
                        return; // Stop here
                    }
                } catch (err) {
                    console.warn('Failed to check feature flags:', err);
                    // Continue if check fails (assume enabled)
                }

                // Fetch knowledge graph meta-graph (clusters/communities) instead of random nodes
                // Use hybrid strategy to get both entity-type clusters AND domain clusters (semantic labels)
                // This gives us:
                // - Entity-type clusters (PolicyDocument, Regulation, etc.)
                // - Domain clusters (ruimtelijke ordening, etc.) - these are the "semantic labels"
                // Lower minClusterSize to show all clusters, even if they have few entities
                // 
                // Note: Can also use GDS algorithms (gds-louvain, gds-leiden, gds-lpa, gds-wcc) for
                // graph-structure-based community detection instead of rule-based clustering
                const response = await fetch(`${getApiBaseUrl()}/knowledge-graph/meta?strategy=hybrid&minClusterSize=1&groupByDomain=true`);
                
                if (isCancelled) return;
                
                if (!response.ok) {
                    const errorMessage = await extractErrorMessage(
                        response,
                        `HTTP ${response.status}: ${response.statusText}`
                    );
                    throw new Error(errorMessage);
                }

                const metaData = await response.json();
                
                if (isCancelled) return;
                
                // Store backend info if available
                if (metaData.backend) {
                    setBackend(metaData.backend);
                }
                
                // Transform meta-graph clusters to nodes
                // Each cluster becomes a node representing a community
                interface ClusterData {
                    id: string;
                    type?: string;
                    label?: string;
                    nodeCount?: number;
                    metadata?: {
                        description?: string;
                        [key: string]: unknown;
                    };
                }

                interface EdgeData {
                    source: string;
                    target: string;
                    type?: string;
                    weight?: number;
                    relationTypes?: string[];
                }

                const clusterNodes = (Object.values(metaData.clusters || {}) as ClusterData[]).map((cluster) => ({
                    id: cluster.id,
                    type: cluster.type || 'Concept', // Clusters are semantic concepts
                    name: cluster.label || cluster.id,
                    description: cluster.metadata?.description || t('common.clusterWithEntities').replace('{{count}}', String(cluster.nodeCount || 0)),
                    nodeCount: cluster.nodeCount || 0,
                    metadata: cluster.metadata || {},
                }));

                // Transform meta-graph edges to relationships
                // Preserve relationTypes array for edge coloring
                const clusterEdges = (metaData.edges || []).map((edge: EdgeData) => ({
                    sourceId: edge.source,
                    targetId: edge.target,
                    type: edge.type || 'RELATED_TO',
                    weight: edge.weight || 1,
                    relationTypes: edge.relationTypes || [], // Array of relationship types between clusters
                }));

                setGraphData({
                    nodes: clusterNodes,
                    edges: clusterEdges
                });
            } catch (err) {
                if (!isCancelled) {
                    logError(err, 'fetch-knowledge-graph-meta');
                    setError(err instanceof Error ? err.message : t('common.failedToLoadGraph'));
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        };

        fetchGraphData();
        
        return () => {
            isCancelled = true;
        };
    }, []);

    // Get available domains from graph data with counts
    const domainStats = useMemo(() => {
        if (!graphData) return [];
        const domainMap = new Map<string, number>();
        graphData.nodes.forEach(node => {
            const domain = node.metadata?.domain;
            if (domain && domain !== 'unknown') {
                domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
            }
        });
        return Array.from(domainMap.entries())
            .map(([domain, count]) => ({ domain, count }))
            .sort((a, b) => b.count - a.count); // Sort by count descending
    }, [graphData]);

    const availableDomains = useMemo(() => {
        return domainStats.map(s => s.domain);
    }, [domainStats]);

    // Transform KG nodes to NVL Node format
    // Note: We pass all nodes to NVL, but NVL's viewport-based rendering will only render visible ones
    // CanvasRenderer.getNodesToRender() filters by viewport bounds automatically
    // CanvasRenderer.isBoundingBoxOffScreen() skips off-screen nodes for performance
    const MAX_NODES_FOR_PERFORMANCE = 200; // Limit nodes to 200 for performance
    const nvlNodes: Node[] = useMemo(() => {
        if (!graphData) return [];

        // Filter nodes by domain - support both single and multi-select
        let filteredNodes = graphData.nodes;
        if (selectedDomains.size > 0) {
            // Multi-select filtering (preferred)
            filteredNodes = graphData.nodes.filter(node => {
                const domain = node.metadata?.domain;
                return domain && selectedDomains.has(domain);
            });
        } else if (domainFilter !== 'ALL') {
            // Legacy single-select filtering
            filteredNodes = graphData.nodes.filter(node => {
                const domain = node.metadata?.domain;
                return domain === domainFilter;
            });
        }

        // Apply GDS metrics filters
        if (metricsFilters.minPageRank !== undefined || metricsFilters.minBetweenness !== undefined || 
            metricsFilters.minDegree !== undefined || metricsFilters.showBottlenecks) {
            filteredNodes = filteredNodes.filter(node => {
                const pagerank = toSafeNumber(node.metadata?.pagerank);
                const betweenness = toSafeNumber(node.metadata?.betweenness);
                const degree = toSafeNumber(node.metadata?.degree);

                // PageRank filter
                if (metricsFilters.minPageRank !== undefined) {
                    if (pagerank === undefined || pagerank < metricsFilters.minPageRank) {
                        return false;
                    }
                }

                // Betweenness filter
                if (metricsFilters.minBetweenness !== undefined) {
                    if (betweenness === undefined || betweenness < metricsFilters.minBetweenness) {
                        return false;
                    }
                }

                // Degree filter
                if (metricsFilters.minDegree !== undefined) {
                    if (degree === undefined || degree < metricsFilters.minDegree) {
                        return false;
                    }
                }

                // Bottleneck filter (high betweenness)
                if (metricsFilters.showBottlenecks) {
                    if (betweenness === undefined || betweenness < 1000) {
                        return false;
                    }
                }

                return true;
            });
        }

        // Limit nodes to 200 for performance (per acceptance criteria)
        const limitedNodes = filteredNodes.slice(0, MAX_NODES_FOR_PERFORMANCE);

        // Pass all nodes to NVL - it will handle viewport culling internally
        // NVL's CanvasRenderer uses isBoundingBoxOffScreen to skip off-screen nodes
        // This enables viewport-based rendering: only render what's visible + buffer
        // As objects cross the render border, they're automatically added/removed from rendering
        // 
        // IMPORTANT: Node sizes are critical for overlap prevention
        // NVL's layout algorithms (dagre for hierarchical, CoseBilkent for force-directed) use
        // node sizes to calculate spacing and prevent overlaps automatically
        // No manual grid calculations needed - NVL handles 2D arrangement natively
        return limitedNodes.map((node) => {
            const domain = node.metadata?.domain;
            const pagerank = toSafeNumber(node.metadata?.pagerank);
            const communityId = toSafeNumber(node.metadata?.communityId);
            const betweenness = toSafeNumber(node.metadata?.betweenness);
            
            // Determine color: domain > communityId > entity type
            let nodeColor: string;
            if (colorByDomain && domain) {
                nodeColor = getDomainColor(domain);
            } else if (communityId !== undefined) {
                // Color by community (GDS community detection)
                nodeColor = getCommunityColor(communityId);
            } else {
                nodeColor = getTypeColor(node.type);
            }
            
            // Determine size: PageRank > degree > default
            let nodeSize: number;
            if (pagerank !== undefined && pagerank > 0) {
                // Scale PageRank to node size (min 20, max 60)
                nodeSize = Math.max(20, Math.min(60, 20 + (pagerank * 200)));
            } else {
                nodeSize = getNodeSize(node.type);
            }
            
            // Determine border width based on betweenness (bottleneck indicator)
            let borderWidth = 0;
            if (betweenness !== undefined && betweenness > 1000) {
                // Scale border width based on betweenness (1-4px)
                borderWidth = Math.min(4, Math.max(1, Math.log10(betweenness / 100) * 0.5));
            }

            return {
                id: node.id,
                caption: node.name || node.id,
                color: nodeColor,
                size: nodeSize,
                icon: getTypeIcon(node.type),
                // Store GDS metrics for tooltip/metadata display
                properties: {
                    pagerank,
                    communityId,
                    betweenness,
                    degree: node.metadata?.degree as number | undefined,
                    eigenvector: node.metadata?.eigenvector as number | undefined
                },
                // Add border for bottleneck nodes (high betweenness)
                ...(borderWidth > 0 && {
                    borderColor: '#9333ea', // purple-600
                    borderWidth: borderWidth
                })
            };
        });
    }, [graphData, domainFilter, selectedDomains, colorByDomain, metricsFilters]);

    // Transform KG edges to NVL Relationship format
    // Use meta-graph edge coloring system based on relationship types
    const nvlRelationships: Relationship[] = useMemo(() => {
        if (!graphData) return [];

        // Only include relationships between nodes we're displaying
        const nodeIds = new Set(nvlNodes.map(n => n.id));

        return graphData.edges
            .filter(edge => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
            .map((edge, index) => {
                // Determine primary relationship type for coloring
                // Meta-graph edges have relationTypes array, regular edges have single type
                const relationTypes = edge.relationTypes || [edge.type];
                const primaryRelation = getPrimaryRelationType(relationTypes);
                const edgeWeight = edge.weight || 1;

                return {
                    id: `rel-${edge.sourceId}-${edge.targetId}-${index}`,
                    from: edge.sourceId,
                    to: edge.targetId,
                    type: primaryRelation,
                    caption: getEdgeLabel(primaryRelation),
                    color: getMetaEdgeColor(primaryRelation, relationTypes, edgeWeight),
                    width: Math.min(Math.max(2, Math.log(edgeWeight + 1) * 1.5), 6), // Width based on weight
                };
            });
    }, [graphData, nvlNodes]);

    // NVL Options - viewport-based rendering (fulcrum-like/SM64-style camera)
    const nvlOptions: NvlOptions = useMemo(() => ({
        layout: layout,
        initialZoom: 1.5, // Increased zoom so text is readable at default view
        minZoom: 0.1,
        maxZoom: 5, // Allow more zoom in for detailed inspection
        disableTelemetry: true,
        // Disable web workers to avoid "Failed to fetch worker script" errors
        // Workers improve performance but can fail in some Vite/dev environments
        // Layout calculations will run on main thread instead
        disableWebWorkers: true,
        // Enable dynamic min zoom - allows camera to zoom out further if graph doesn't fit
        // This creates a "fulcrum" effect where the camera adjusts dynamically
        allowDynamicMinZoom: true,
        // Use canvas renderer for better caption support and smoother interactions
        // WebGL is faster but canvas provides better visual feedback for fulcrum-style navigation
        renderer: 'canvas' as const,
        // Viewport-based rendering: relationshipThreshold limits rendering to viewport + buffer
        // Only relationships within this distance threshold are rendered
        // This enables viewport culling - only render what's visible + small buffer
        // Value is in pixels - relationships beyond this distance from viewport won't render
        relationshipThreshold: 2000, // Render relationships within 2000px of viewport (viewport + buffer)
        // Hierarchical layout options - uses dagre algorithm with native overlap prevention
        // dagre automatically calculates node spacing to prevent overlaps
        // 'bin' packing uses bin-packing algorithm for optimal 2D arrangement (prevents overlaps)
        // 'stack' packing stacks nodes but may cause overlaps in dense graphs
        hierarchicalOptions: layout === 'hierarchical' ? {
            direction: 'down', // Top to bottom for depth visualization
            packing: 'bin', // Bin-packing prevents overlaps - uses 2D bin-packing algorithm for optimal spacing
            // dagre internally handles:
            // - nodesep: minimum horizontal spacing between nodes
            // - ranksep: minimum vertical spacing between ranks
            // - SubGraphSpacing: 100px spacing between subgraphs
            // All nodes are automatically positioned to prevent overlaps
        } : undefined,
        // Force-directed options - uses physics simulation to prevent overlaps
        // CoseBilkent (CoSE-Bilkent) layout is automatically used for small graphs when enabled
        // Since we're displaying clusters/communities (typically < 100 nodes), CoseBilkent will be used
        // CoseBilkent provides better initial positioning and overlap prevention for smaller graphs
        // For larger graphs, NVL automatically switches to physics-based force-directed layout
        forceDirectedOptions: layout === 'forceDirected' ? {
            // Enable CoseBilkent for small graphs (automatic switching)
            // CoseBilkent uses spacingFactor internally to prevent overlaps
            // - Better initial positioning than random/force-directed
            // - Handles compound nodes and hierarchical structures well
            // - Automatically prevents node overlaps with proper spacing
            enableCytoscape: true, // Enable CoseBilkent for small graphs (clusters will use this)
            enableVerlet: true, // Use new physics engine for larger graphs (default)
            // Note: NVL's ForceCytoLayout automatically decides:
            // - Small graphs (< threshold): Uses CoseBilkent layout
            // - Large graphs: Uses Verlet physics engine
            // Since we're showing clusters, CoseBilkent will be used
        } : undefined,
    }), [layout]);

    // Load paginated cluster entities
    const loadClusterEntities = useCallback(async (clusterId: string, page: number) => {
        try {
            setIsLoadingEntities(true);
            // Load double the page size for smooth scrolling (render 20, show 10)
            const limit = ENTITIES_TO_RENDER;
            const offset = page * ENTITIES_PER_PAGE;
            
            // Fetch paginated cluster entities
            const response = await fetch(
                `${getApiBaseUrl()}/knowledge-graph/cluster/${clusterId}?strategy=hybrid&minClusterSize=1&groupByDomain=true&limit=${limit}&offset=${offset}`
            );
            if (!response.ok) {
                const errorMessage = await extractErrorMessage(
                    response,
                    t('common.failedToFetchCluster').replace('{{status}}', response.statusText)
                );
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            // Use ref to check current cluster and prevent race conditions
            if (expandedClusterIdRef.current === clusterId) {
                // Safety check: filter out any duplicate entities by ID (should not happen after backend deduplication)
                // Backend now deletes duplicates before inserting, so this is just a safety measure
                const entities = data.entities || [];
                const seenIds = new Set<string>();
                const uniqueEntities = entities.filter((entity: KGNode) => {
                    if (seenIds.has(entity.id)) {
                        return false;
                    }
                    seenIds.add(entity.id);
                    return true;
                });
                
                // Log warning if duplicates were found (indicates backend deduplication may have failed)
                if (entities.length > uniqueEntities.length) {
                    console.warn(`Found ${entities.length - uniqueEntities.length} duplicate entities in cluster ${clusterId} - backend deduplication should have removed these`);
                }
                
                setClusterEntities(uniqueEntities);
                // Keep original count for pagination (total entities in cluster from server)
                // If duplicates were found, the count may be slightly off, but pagination will still work
                setClusterEntityCount(data.entityCount || 0);
                setClusterEntitiesPage(page);
            }
        } catch (err) {
            // Handle 404 errors gracefully - cluster might not exist or might have been filtered out
            if (err instanceof Error && err.message.includes('not found')) {
                console.warn(`Cluster ${clusterId} not found - it may have been filtered out or removed`);
                setClusterEntities([]);
                setClusterEntityCount(0);
            } else {
                logError(err, 'fetch-cluster-entities');
            }
        } finally {
            setIsLoadingEntities(false);
        }
    }, []);

    // Handle cluster expansion - when a cluster is clicked, fetch its entities
    const handleClusterClick = useCallback(async (clusterId: string) => {
        expandedClusterIdRef.current = clusterId;
        setExpandedClusterId(clusterId);
        setClusterEntitiesPage(0);
        await loadClusterEntities(clusterId, 0);
    }, [loadClusterEntities]);

    // Load next page of entities
    const loadNextPage = () => {
        if (expandedClusterId && !isLoadingEntities) {
            const nextPage = clusterEntitiesPage + 1;
            const currentOffset = clusterEntitiesPage * ENTITIES_PER_PAGE;
            const totalLoaded = currentOffset + clusterEntities.length;
            
            // Only load if we haven't loaded all entities yet
            if (totalLoaded < clusterEntityCount) {
                loadClusterEntities(expandedClusterId, nextPage);
            }
        }
    };

    // Load previous page
    const loadPreviousPage = () => {
        if (expandedClusterId && clusterEntitiesPage > 0 && !isLoadingEntities) {
            loadClusterEntities(expandedClusterId, clusterEntitiesPage - 1);
        }
    };

    // Handle entity click - fetch detailed metadata
    const handleEntityClick = async (entity: KGNode) => {
        setSelectedEntity(entity);
        setIsLoadingMetadata(true);
        try {
            // Fetch detailed entity metadata
            const response = await fetch(`${getApiBaseUrl()}/knowledge-graph/entity/${encodeURIComponent(entity.id)}`);
            if (!response.ok) {
                const errorMessage = await extractErrorMessage(
                    response,
                    t('common.failedToFetchEntityMetadata').replace('{{status}}', response.statusText)
                );
                throw new Error(errorMessage);
            }
            const data = await response.json();
            setEntityMetadata(data);
        } catch (err) {
            logError(err, 'fetch-entity-metadata');
            setEntityMetadata({ error: t('test.failedToLoadMetadata') });
        } finally {
            setIsLoadingMetadata(false);
        }
    };

    // Mouse event callbacks for cluster interactions
    const mouseEventCallbacks = useMemo(() => ({
        onNodeClick: (node: Node) => {
            console.log('Cluster clicked:', node);
            // Expand cluster to show entities inside
            handleClusterClick(node.id);
        },
        onRelationshipClick: (rel: Relationship) => {
            console.log('Relationship clicked:', rel);
        },
        onHover: (_element: Node | Relationship | null) => {
            // Handle hover - show cluster info
        },
    }), [handleClusterClick]);

    // NVL callbacks for camera/zoom events (viewport-based rendering)
    const nvlCallbacks = useMemo(() => ({
        onLayoutDone: () => {
            // Layout complete - viewport-based rendering will automatically cull off-screen elements
            // NVL's CanvasRenderer uses isBoundingBoxOffScreen to skip rendering off-screen nodes/edges
        },
        onZoomTransitionDone: () => {
            // Zoom transition complete - viewport changed, NVL will re-render visible elements
            // CanvasRenderer's getNodesToRender/getRelationshipsToRender filter by viewport
        },
        onInitialization: () => {
            // NVL initialized - viewport culling active
            // CanvasRenderer automatically uses viewport bounds to determine what to render
        },
        onLayoutStep: (_nodes: Node[]) => {
            // Layout step - viewport culling happens on each render
            // Only nodes/relationships in viewport + buffer are rendered
        },
    }), []);

    if (!kgEnabled) {
        return (
            <div className="flex items-center justify-center h-full min-h-[600px]">
                <div className="text-center max-w-md bg-card rounded-lg shadow-lg border border-destructive/30 p-6">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                    <h3 className="text-lg font-bold text-foreground mb-2">{t('knowledgePage.kgDisabled')}</h3>
                    <p className="text-muted-foreground">{t('knowledgePage.kgDisabledDescription')}</p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[600px]" data-testid="nvl-loading-state">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-muted-foreground">{t('common.loadingKnowledgeGraph')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full min-h-[600px]">
                <div className="max-w-md bg-card rounded-lg shadow-lg border border-destructive/30 p-6">
                    <div className="flex items-start gap-4">
                        <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-2">{t('common.errorLoadingGraph')}</h3>
                            <p className="text-muted-foreground mb-4">{error}</p>
                            <Button
                                onClick={() => window.location.reload()}
                                variant="outline"
                            >
                                Retry
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!graphData || nvlNodes.length === 0) {
        return (
            <div className="flex items-center justify-center h-full min-h-[600px]">
                <div className="text-center">
                    <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">{t('neo4jNVL.noCommunitiesFound')}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                        {t('neo4jNVL.runWorkflowOrSeed')}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full min-h-[600px] flex flex-col">
            {/* Header with layout selector */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-blue-600" />
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{t('neo4jNVL.knowledgeGraph')}</h3>
                            {backend && (
                                <Badge 
                                    variant={backend === 'graphdb' ? 'default' : 'secondary'}
                                    className="text-xs"
                                    title={t('common.usingBackend').replace('{{backend}}', backend === 'graphdb' ? t('common.graphDB') : t('common.neo4j'))}
                                >
                                    {backend === 'graphdb' ? t('common.graphDB') : t('common.neo4j')}
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {nvlNodes.length} {t('neo4jNVL.entities')}, {nvlRelationships.length} {t('neo4jNVL.relationships')}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    <Button
                        variant={layout === 'hierarchical' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setLayout('hierarchical')}
                    >
                        {t('neo4jNVL.hierarchical')}
                    </Button>
                    <Button
                        variant={layout === 'forceDirected' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setLayout('forceDirected')}
                        title={t('common.usesCoseBilkentLayout')}
                    >
                        {t('neo4jNVL.forceDirected')}
                    </Button>
                    {/* Domain filter, color toggle, legend, and stats */}
                    {graphData && availableDomains.length > 0 && (
                        <div className="ml-4 flex items-center gap-2">
                            {/* Multi-select domain filter */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8">
                                        <Filter className="h-4 w-4 mr-2" />
                                        {t('neo4jNVL.domains')}
                                        {selectedDomains.size > 0 && (
                                            <span className="ml-2 bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 text-xs">
                                                {selectedDomains.size}
                                            </span>
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
                                    <DropdownMenuLabel>{t('neo4jNVL.filterByDomain')}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuCheckboxItem
                                        checked={selectedDomains.size === 0}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setSelectedDomains(new Set());
                                                setDomainFilter('ALL');
                                            }
                                        }}
                                    >
                                        All Domains
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator />
                                    {domainStats.map(({ domain, count }) => (
                                        <DropdownMenuCheckboxItem
                                            key={domain}
                                            checked={selectedDomains.has(domain)}
                                            onCheckedChange={(checked) => {
                                                const newSet = new Set(selectedDomains);
                                                if (checked) {
                                                    newSet.add(domain);
                                                } else {
                                                    newSet.delete(domain);
                                                }
                                                setSelectedDomains(newSet);
                                                setDomainFilter('ALL'); // Clear single-select when using multi-select
                                            }}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: getDomainColor(domain) }}
                                                    />
                                                    <span>{domain}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground ml-2">{count}</span>
                                            </div>
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                    {selectedDomains.size > 0 && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuCheckboxItem
                                                onSelect={(e) => {
                                                    e.preventDefault();
                                                    setSelectedDomains(new Set());
                                                    setDomainFilter('ALL');
                                                }}
                                                className="text-blue-600"
                                            >
                                                Clear all
                                            </DropdownMenuCheckboxItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Color by domain toggle */}
                            <Button
                                variant={colorByDomain ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setColorByDomain(!colorByDomain)}
                                title={t('common.colorNodesByDomain')}
                                className="h-8"
                            >
                                Color by Domain
                            </Button>

                            {/* Domain legend */}
                            <Popover open={showLegend} onOpenChange={setShowLegend}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8">
                                        <Info className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                    <div className="space-y-3">
                                        <h4 className="font-semibold text-sm">{t('neo4jNVL.domainColorLegend')}</h4>
                                        <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                                            {domainStats.map(({ domain, count }) => (
                                                <div key={domain} className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-4 h-4 rounded border border-input"
                                                            style={{ backgroundColor: getDomainColor(domain) }}
                                                        />
                                                        <span>{domain}</span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">{count} nodes</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Domain statistics */}
                            <Popover open={showStats} onOpenChange={setShowStats}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8">
                                        <BarChart3 className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-96">
                                    <div className="space-y-3">
                                        <h4 className="font-semibold text-sm">Domain Distribution</h4>
                                        <div className="space-y-2">
                                            {domainStats.map(({ domain, count }) => {
                                                const total = domainStats.reduce((sum, s) => sum + s.count, 0);
                                                const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
                                                return (
                                                    <div key={domain} className="space-y-1">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className="w-3 h-3 rounded-full"
                                                                    style={{ backgroundColor: getDomainColor(domain) }}
                                                                />
                                                                <span className="font-medium">{domain}</span>
                                                            </div>
                                                            <span className="text-muted-foreground">{count} ({percentage}%)</span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="h-2 rounded-full transition-all"
                                                                style={{
                                                                    width: `${percentage}%`,
                                                                    backgroundColor: getDomainColor(domain)
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="pt-2 border-t text-xs text-muted-foreground border-border">
                                            Total: {domainStats.reduce((sum, s) => sum + s.count, 0)} nodes across {domainStats.length} domains
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* GDS Metrics Dashboard */}
                            <Popover open={showMetricsDashboard} onOpenChange={setShowMetricsDashboard}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8">
                                        <BarChart3 className="h-4 w-4 mr-1" />
                                        Metrics
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-96 max-h-[600px] overflow-y-auto">
                                    <div className="space-y-4">
                                        <h4 className="font-semibold text-sm">{t('admin.gdsMetricsDashboard')}</h4>
                                        
                                        {/* Metrics Filters */}
                                        <div className="space-y-3 border-b pb-3">
                                            <h5 className="font-medium text-xs text-foreground">{t('common.filters')}</h5>
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Checkbox
                                                        id="show-bottlenecks"
                                                        checked={metricsFilters.showBottlenecks || false}
                                                        onCheckedChange={(checked) => {
                                                            setMetricsFilters(prev => ({
                                                                ...prev,
                                                                showBottlenecks: checked as boolean
                                                            }));
                                                        }}
                                                    />
                                                    <label htmlFor="show-bottlenecks" className="text-xs text-muted-foreground cursor-pointer">
                                                        {t('admin.showBottlenecksOnly')}
                                                    </label>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs text-muted-foreground">Min PageRank</label>
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        min="0"
                                                        className="w-full px-2 py-1 text-xs border rounded"
                                                        placeholder="0.001"
                                                        value={metricsFilters.minPageRank || ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value ? parseFloat(e.target.value) : undefined;
                                                            setMetricsFilters(prev => ({
                                                                ...prev,
                                                                minPageRank: value
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs text-muted-foreground">Min Betweenness</label>
                                                    <input
                                                        type="number"
                                                        step="100"
                                                        min="0"
                                                        className="w-full px-2 py-1 text-xs border rounded"
                                                        placeholder="100"
                                                        value={metricsFilters.minBetweenness || ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value ? parseFloat(e.target.value) : undefined;
                                                            setMetricsFilters(prev => ({
                                                                ...prev,
                                                                minBetweenness: value
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-xs text-muted-foreground">{t('admin.minDegree')}</label>
                                                    <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        className="w-full px-2 py-1 text-xs border rounded"
                                                        placeholder="5"
                                                        value={metricsFilters.minDegree || ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value ? parseInt(e.target.value) : undefined;
                                                            setMetricsFilters(prev => ({
                                                                ...prev,
                                                                minDegree: value
                                                            }));
                                                        }}
                                                    />
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full text-xs"
                                                    onClick={() => setMetricsFilters({})}
                                                >
                                                    {t('common.clearFilters')}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Metrics Statistics */}
                                        {graphData && (
                                            <div className="space-y-3">
                                                <h5 className="font-medium text-xs text-gray-700">Statistics</h5>
                                                {(() => {
                                                    const nodesWithMetrics = graphData.nodes.filter(n => 
                                                        n.metadata?.pagerank !== undefined ||
                                                        n.metadata?.betweenness !== undefined ||
                                                        n.metadata?.degree !== undefined
                                                    );
                                                    
                                                    if (nodesWithMetrics.length === 0) {
                                                        return (
                                                            <div className="text-xs text-gray-500 text-center py-4">
                                                                No GDS metrics available. Run <code className="bg-gray-100 px-1 rounded">pnpm run kg:compute-metrics</code>
                                                            </div>
                                                        );
                                                    }

                                                    const pageranks = nodesWithMetrics
                                                        .map(n => toSafeNumber(n.metadata?.pagerank))
                                                        .filter((p): p is number => p !== undefined);
                                                    const betweennesses = nodesWithMetrics
                                                        .map(n => toSafeNumber(n.metadata?.betweenness))
                                                        .filter((b): b is number => b !== undefined);
                                                    const degrees = nodesWithMetrics
                                                        .map(n => toSafeNumber(n.metadata?.degree))
                                                        .filter((d): d is number => d !== undefined);
                                                    const bottlenecks = nodesWithMetrics.filter(n => 
                                                        (n.metadata?.betweenness as number | undefined) && (n.metadata?.betweenness as number) > 1000
                                                    );

                                                    return (
                                                        <div className="space-y-2 text-xs">
                                                            {pageranks.length > 0 && (
                                                                <div className="p-2 bg-blue-50 rounded">
                                                                    <div className="font-medium text-blue-900 mb-1">PageRank</div>
                                                                    <div className="text-blue-700">
                                                                        Max: {Math.max(...pageranks).toFixed(6)}<br/>
                                                                        Avg: {(pageranks.reduce((a, b) => a + b, 0) / pageranks.length).toFixed(6)}<br/>
                                                                        Nodes: {pageranks.length}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {betweennesses.length > 0 && (
                                                                <div className="p-2 bg-purple-50 rounded">
                                                                    <div className="font-medium text-purple-900 mb-1">Betweenness</div>
                                                                    <div className="text-purple-700">
                                                                        Max: {Math.max(...betweennesses).toFixed(2)}<br/>
                                                                        Avg: {(betweennesses.reduce((a, b) => a + b, 0) / betweennesses.length).toFixed(2)}<br/>
                                                                        {t('admin.bottlenecksLabel')} {bottlenecks.length}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {degrees.length > 0 && (
                                                                <div className="p-2 bg-green-50 rounded">
                                                                    <div className="font-medium text-green-900 mb-1">Degree</div>
                                                                    <div className="text-green-700">
                                                                        Max: {Math.max(...degrees)}<br/>
                                                                        Avg: {(degrees.reduce((a, b) => a + b, 0) / degrees.length).toFixed(1)}<br/>
                                                                        Nodes: {degrees.length}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Node count */}
                            <div className="text-xs text-gray-500 px-2">
                                {nvlNodes.length} {t('common.nodes')}
                                {selectedDomains.size > 0 && ` (${selectedDomains.size} ${t('common.selected')})`}
                                {metricsFilters.showBottlenecks && ` (${t('admin.bottlenecks')})`}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main content area - graph + expanded cluster panel */}
            <div className="flex-1 flex relative bg-background">
                {/* NVL Visualization */}
                <div className={`flex-1 relative ${expandedClusterId ? (selectedEntity ? 'w-1/3' : 'w-2/3') : 'w-full'} transition-all duration-300`} data-testid="nvl-container">
                    <div data-testid="nvl-wrapper" className="w-full h-full">
                        <InteractiveNvlWrapper
                            nodes={nvlNodes}
                            rels={nvlRelationships}
                            nvlOptions={nvlOptions}
                            nvlCallbacks={nvlCallbacks}
                            mouseEventCallbacks={mouseEventCallbacks}
                            className="w-full h-full"
                        />
                    </div>
                </div>

                {/* Expanded Cluster Panel - shows entities when a cluster is clicked */}
                {expandedClusterId && (
                    <div className={`${selectedEntity ? 'w-1/2' : 'w-1/3'} border-l bg-gray-50 flex flex-col transition-all duration-300`}>
                        <div className="p-4 border-b bg-gray-50 flex-shrink-0">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold text-gray-900">Cluster Entities</h4>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        expandedClusterIdRef.current = null;
                                        setExpandedClusterId(null);
                                        setClusterEntities([]);
                                        setClusterEntityCount(0);
                                        setClusterEntitiesPage(0);
                                    }}
                                >
                                    ×
                                </Button>
                            </div>
                            <p className="text-sm text-gray-600">
                                {t('common.showing')} {Math.min((clusterEntitiesPage * ENTITIES_PER_PAGE) + 1, clusterEntityCount)}-{Math.min((clusterEntitiesPage * ENTITIES_PER_PAGE) + Math.min(ENTITIES_PER_PAGE, clusterEntities.length), clusterEntityCount)} {t('common.of')} {clusterEntityCount} {t('common.entries')}
                            </p>
                        </div>
                        
                        {/* Scrollable entity list - shows 10 items at a time, renders 20 for smooth scrolling */}
                        <div className="flex-1 overflow-y-auto">
                            <div className="p-4 space-y-2">
                                {isLoadingEntities && clusterEntities.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">{t('common.loadingEntities')}</p>
                                ) : clusterEntities.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">{t('common.noEntitiesFound')}</p>
                                ) : (
                                    // Render all loaded entities (up to ENTITIES_TO_RENDER for smooth scrolling)
                                    // But only ENTITIES_PER_PAGE are visible at a time based on scroll position
                                    clusterEntities.map((entity, index) => (
                                        <div
                                            key={`${entity.id}-${index}`}
                                            className="p-3 bg-card rounded border border-border hover:border-primary transition-colors cursor-pointer"
                                            onClick={() => handleEntityClick(entity)}
                                        >
                                            <div className="font-medium text-sm text-gray-900">
                                                {entity.name || entity.id}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                Type: {entity.type}
                                            </div>
                                            {entity.metadata?.domain && (
                                                <div className="text-xs text-blue-600 mt-1 font-medium">
                                                    Domain: {entity.metadata.domain}
                                                </div>
                                            )}
                                            {entity.description && (
                                                <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                                                    {entity.description}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        
                        {/* Pagination controls */}
                        <div className="p-4 border-t bg-gray-50 flex-shrink-0">
                            <div className="flex items-center justify-between">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={loadPreviousPage}
                                    disabled={clusterEntitiesPage === 0 || isLoadingEntities}
                                >
                                    ← {t('common.previous')}
                                </Button>
                                <span className="text-sm text-gray-600">
                                    {t('common.page')} {clusterEntitiesPage + 1} {t('common.of')} {Math.ceil(clusterEntityCount / ENTITIES_PER_PAGE)}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={loadNextPage}
                                    disabled={
                                        isLoadingEntities ||
                                        (clusterEntitiesPage + 1) * ENTITIES_PER_PAGE >= clusterEntityCount
                                    }
                                >
                                    {t('common.next')} →
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Entity Metadata Panel - shows when an entity is clicked */}
                {selectedEntity && (
                    <div className="w-1/2 border-l bg-card flex flex-col border-border">
                        <div className="p-4 border-b bg-muted flex-shrink-0 border-border">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold text-gray-900">{t('admin.entityMetadata')}</h4>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSelectedEntity(null);
                                        setEntityMetadata(null);
                                    }}
                                >
                                    ×
                                </Button>
                            </div>
                            <div className="font-medium text-sm text-gray-900">
                                {selectedEntity.name || selectedEntity.id}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                {t('common.type')} {selectedEntity.type}
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4">
                            {isLoadingMetadata ? (
                                <p className="text-sm text-gray-500 text-center py-4">{t('admin.loadingMetadata')}</p>
                            ) : entityMetadata?.error ? (
                                <p className="text-sm text-red-500 text-center py-4">{entityMetadata.error}</p>
                            ) : entityMetadata ? (
                                <div className="space-y-4">
                                    {/* Source Information */}
                                    <div>
                                        <h5 className="font-semibold text-sm text-gray-900 mb-2">{t('common.source')}</h5>
                                        <div className="text-xs text-gray-600 space-y-1">
                                            {entityMetadata.url && (
                                                <div>
                                                    <span className="font-medium">URL:</span> {entityMetadata.url}
                                                </div>
                                            )}
                                            {entityMetadata.metadata?.source && (
                                                <div>
                                                    <span className="font-medium">Scraper:</span> {entityMetadata.metadata.source}
                                                </div>
                                            )}
                                            {!entityMetadata.metadata?.source && (
                                                <div>
                                                    <span className="font-medium">Scraper:</span> IPLOScraper (inferred)
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Label Construction */}
                                    <div>
                                        <h5 className="font-semibold text-sm text-gray-900 mb-2">Label Construction</h5>
                                        <div className="text-xs text-gray-600 space-y-1">
                                            <div>
                                                <span className="font-medium">Name:</span> {entityMetadata.name || entityMetadata.id}
                                            </div>
                                            {entityMetadata.type && (
                                                <div>
                                                    <span className="font-medium">Type:</span> {entityMetadata.type}
                                                </div>
                                            )}
                                            {entityMetadata.metadata?.domain && (
                                                <div>
                                                    <span className="font-medium">Domain:</span> {String(entityMetadata.metadata.domain)}
                                                </div>
                                            )}
                                            
                                            {/* GDS Metrics */}
                                            {((): React.ReactNode => {
                                                const metadata = entityMetadata.metadata as KGNodeMetadata | undefined;
                                                const hasMetrics = (metadata?.pagerank !== undefined) ||
                                                    (metadata?.betweenness !== undefined) ||
                                                    (metadata?.degree !== undefined) ||
                                                    (metadata?.communityId !== undefined) ||
                                                    (metadata?.eigenvector !== undefined);
                                                if (!hasMetrics) return null;
                                                return (
                                                <div className="mt-4 pt-4 border-t">
                                                    <h5 className="font-semibold text-sm text-gray-900 mb-2">{t('admin.gdsMetrics')}</h5>
                                                    <div className="text-xs text-gray-600 space-y-1">
                                                        {entityMetadata.metadata?.pagerank !== undefined ? (() => {
                                                            const pagerankValue = (entityMetadata.metadata as KGNodeMetadata).pagerank;
                                                            const pagerank = isNeo4jInteger(pagerankValue)
                                                                ? pagerankValue.toNumber()
                                                                : isNeo4jIntegerLowHigh(pagerankValue)
                                                                ? pagerankValue.low + (pagerankValue.high * 0x100000000)
                                                                : Number(pagerankValue);
                                                            return (
                                                                <div className="flex items-center justify-between" key="pagerank">
                                                                    <span className="font-medium">PageRank:</span>
                                                                    <span className="text-blue-600 font-mono">
                                                                        {pagerank.toFixed(6)}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })() as ReactNode : null}
                                                        {entityMetadata.metadata?.betweenness !== undefined && (() => {
                                                            const betweennessValue = (entityMetadata.metadata as KGNodeMetadata).betweenness;
                                                            const betweenness = isNeo4jInteger(betweennessValue)
                                                                ? betweennessValue.toNumber()
                                                                : isNeo4jIntegerLowHigh(betweennessValue)
                                                                ? betweennessValue.low + (betweennessValue.high * 0x100000000)
                                                                : Number(betweennessValue);
                                                            return (
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-medium">Betweenness:</span>
                                                                    <span className="text-purple-600 font-mono">
                                                                        {betweenness.toFixed(2)}
                                                                    </span>
                                                                    {betweenness > 1000 && (
                                                                        <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                                                                            Bottleneck
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                        {entityMetadata.metadata?.degree !== undefined && (() => {
                                                            const degreeValue = (entityMetadata.metadata as KGNodeMetadata).degree;
                                                            const degree = isNeo4jInteger(degreeValue)
                                                                ? degreeValue.toNumber()
                                                                : isNeo4jIntegerLowHigh(degreeValue)
                                                                ? degreeValue.low + (degreeValue.high * 0x100000000)
                                                                : Number(degreeValue);
                                                            return (
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-medium">Degree:</span>
                                                                    <span className="text-green-600 font-mono">
                                                                        {degree}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })()}
                                                        {entityMetadata.metadata?.communityId !== undefined && (
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-medium">Community ID:</span>
                                                                <span className="text-orange-600 font-mono">
                                                                    {(() => {
                                                                        const communityIdValue = (entityMetadata.metadata as KGNodeMetadata).communityId;
                                                                        if (isNeo4jInteger(communityIdValue)) {
                                                                            return String(communityIdValue.toNumber());
                                                                        }
                                                                        if (isNeo4jIntegerLowHigh(communityIdValue)) {
                                                                            return String(communityIdValue.low + (communityIdValue.high * 0x100000000));
                                                                        }
                                                                        return String(communityIdValue);
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {entityMetadata.metadata?.eigenvector !== undefined && (() => {
                                                            const eigenvector = toSafeNumber((entityMetadata.metadata as KGNodeMetadata).eigenvector);
                                                            return eigenvector !== undefined ? (
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-medium">Eigenvector:</span>
                                                                    <span className="text-teal-600 font-mono">
                                                                        {eigenvector.toFixed(6)}
                                                                    </span>
                                                                </div>
                                                            ) : null;
                                                        })()}
                                                    </div>
                                                </div>
                                                ) as React.ReactNode;
                                            })() as React.ReactNode | null}
                                            {entityMetadata.jurisdiction && typeof entityMetadata.jurisdiction === 'string' && (
                                                <div>
                                                    <span className="font-medium">Jurisdiction:</span> {entityMetadata.jurisdiction}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Domain Information */}
                                    {entityMetadata.metadata?.domain && (
                                        <div>
                                            <h5 className="font-semibold text-sm text-gray-900 mb-2">Domain</h5>
                                            <div className="text-xs text-gray-600">
                                                <div>
                                                    <span className="font-medium">Extracted Domain:</span> {String(entityMetadata.metadata.domain)}
                                                </div>
                                                <div className="mt-1 text-gray-500">
                                                    Domain extracted from: {String(entityMetadata.metadata.domainSource || 'entity metadata')}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* GDS Metrics */}
                                            {(entityMetadata.metadata?.pagerank !== undefined ||
                                              entityMetadata.metadata?.betweenness !== undefined ||
                                              entityMetadata.metadata?.degree !== undefined ||
                                              entityMetadata.metadata?.communityId !== undefined ||
                                              entityMetadata.metadata?.eigenvector !== undefined) ? (
                                        <div>
                                            <h5 className="font-semibold text-sm text-gray-900 mb-2">GDS Metrics</h5>
                                            <div className="text-xs text-gray-600 space-y-2">
                                                {entityMetadata.metadata?.pagerank !== undefined && (() => {
                                                    const pagerank = toSafeNumber(entityMetadata.metadata.pagerank);
                                                    return pagerank !== undefined ? (
                                                        <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                                                            <span className="font-medium">PageRank:</span>
                                                            <span className="text-blue-600 font-mono">
                                                                {pagerank.toFixed(6)}
                                                            </span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                                {entityMetadata.metadata?.betweenness !== undefined && (() => {
                                                    const betweenness = toSafeNumber(entityMetadata.metadata.betweenness);
                                                    return betweenness !== undefined ? (
                                                        <div className="flex items-center justify-between p-2 bg-purple-50 rounded">
                                                            <span className="font-medium">Betweenness:</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-purple-600 font-mono">
                                                                    {betweenness.toFixed(2)}
                                                                </span>
                                                                {betweenness > 1000 && (
                                                                    <span className="px-1.5 py-0.5 bg-purple-200 text-purple-800 rounded text-xs font-semibold">
                                                                        Bottleneck
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : null;
                                                })()}
                                                {entityMetadata.metadata?.degree !== undefined && (() => {
                                                    const degree = toSafeNumber(entityMetadata.metadata.degree);
                                                    return degree !== undefined ? (
                                                        <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                                                            <span className="font-medium">Degree:</span>
                                                            <span className="text-green-600 font-mono">
                                                                {degree}
                                                            </span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                                {entityMetadata.metadata?.communityId !== undefined && (() => {
                                                    const communityId = toSafeNumber(entityMetadata.metadata.communityId);
                                                    return communityId !== undefined ? (
                                                        <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
                                                            <span className="font-medium">Community ID:</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-orange-600 font-mono">
                                                                    {communityId}
                                                                </span>
                                                                <div
                                                                    className="w-4 h-4 rounded-full border border-gray-300"
                                                                    style={{ backgroundColor: getCommunityColor(communityId) }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ) : null;
                                                })()}
                                                {entityMetadata.metadata?.eigenvector !== undefined && (() => {
                                                    const eigenvector = toSafeNumber(entityMetadata.metadata.eigenvector);
                                                    return eigenvector !== undefined ? (
                                                        <div className="flex items-center justify-between p-2 bg-teal-50 rounded">
                                                            <span className="font-medium">Eigenvector:</span>
                                                            <span className="text-teal-600 font-mono">
                                                                {eigenvector.toFixed(6)}
                                                            </span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Full Metadata */}
                                    <div>
                                        <h5 className="font-semibold text-sm text-gray-900 mb-2">{t('admin.fullMetadata')}</h5>
                                        <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-48">
                                            {JSON.stringify(entityMetadata.metadata || {}, null, 2)}
                                        </pre>
                                    </div>

                                    {/* Relationships */}
                                    {entityMetadata.relationships && entityMetadata.relationships.length > 0 && (
                                        <div>
                                            <h5 className="font-semibold text-sm text-gray-900 mb-2">Relationships</h5>
                                            <div className="text-xs text-gray-600 space-y-1">
                                                {entityMetadata.relationships.slice(0, 5).map((rel: { type: string; targetId: string }, idx: number) => (
                                                    <div key={idx}>
                                                        {rel.type} → {rel.targetId}
                                                    </div>
                                                ))}
                                                {entityMetadata.relationships.length > 5 && (
                                                    <div className="text-gray-500">
                                                        ... and {entityMetadata.relationships.length - 5} more
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper function to safely convert Neo4j Integer objects to numbers
function toSafeNumber(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    // Check if it's a Neo4j Integer object (has toNumber method)
    if (isNeo4jInteger(value)) {
        return value.toNumber();
    }
    // Check if it's a Neo4j Integer object with low/high properties
    if (isNeo4jIntegerLowHigh(value)) {
        // Convert Neo4j Integer to number
        return value.low + (value.high * 0x100000000);
    }
    // Try to parse as number
    const num = Number(value);
    return isNaN(num) ? undefined : num;
}

// Helper functions for styling
function getTypeColor(type: string): string {
    switch (type) {
        case 'PolicyDocument': return '#2563eb'; // blue-600
        case 'Regulation': return '#dc2626'; // red-600
        case 'SpatialUnit': return '#16a34a'; // green-600
        case 'LandUse': return '#d97706'; // amber-600
        case 'Requirement': return '#9333ea'; // purple-600
        default: return '#64748b'; // slate-500
    }
}

/**
 * Get color for domain-based coloring
 * Uses distinct colors for each semantic domain
 */
function getDomainColor(domain: string): string {
    const domainColors: Record<string, string> = {
        'ruimtelijke ordening': '#2563eb', // blue-600 - spatial planning
        'milieu': '#16a34a', // green-600 - environment
        'water': '#06b6d4', // cyan-500 - water
        'natuur': '#22c55e', // green-500 - nature
        'verkeer': '#f59e0b', // amber-500 - traffic
        'wonen': '#ec4899', // pink-500 - housing
        'economie': '#f97316', // orange-500 - economy
        'cultuur': '#a855f7', // purple-500 - culture
        'onderwijs': '#3b82f6', // blue-500 - education
        'gezondheid': '#ef4444', // red-500 - health
        'energie': '#eab308', // yellow-500 - energy
        'klimaat': '#14b8a6', // teal-500 - climate
        'bodem': '#92400e', // amber-700 - soil
        'geluid': '#8b5cf6', // purple-500 - noise
        'lucht': '#0ea5e9', // sky-500 - air
        'afval': '#64748b', // slate-500 - waste
    };
    return domainColors[domain] || '#64748b'; // slate-500 as default
}

/**
 * Get color for community-based coloring (GDS community detection)
 * Uses a color palette that cycles through communities
 */
function getCommunityColor(communityId: number): string {
    // Color palette for communities (distinct colors)
    const palette = [
        '#e41a1c', '#377eb8', '#4daf4a', '#984ea3',
        '#ff7f00', '#ffff33', '#a65628', '#f781bf',
        '#999999', '#66c2a5', '#fc8d62', '#8da0cb',
        '#e78ac3', '#a6d854', '#ffd92f', '#e5c494'
    ];
    return palette[communityId % palette.length];
}

function getNodeSize(type: string): number {
    switch (type) {
        case 'PolicyDocument': return 40;
        case 'Regulation': return 35;
        case 'SpatialUnit': return 30;
        case 'LandUse': return 30;
        case 'Requirement': return 25;
        default: return 25;
    }
}

function getTypeIcon(_type: string): string | undefined {
    // You can add icon URLs here if you have them
    return undefined;
}

function getEdgeLabel(type: string): string {
    switch (type) {
        case 'DEFINED_IN': return 'gedefinieerd in';
        case 'APPLIES_TO': return 'geldt voor';
        case 'LOCATED_IN': return 'ligt in';
        case 'CONSTRAINS': return 'beperkt';
        case 'HAS_REQUIREMENT': return 'heeft eis';
        case 'RELATED_TO': return 'gerelateerd aan';
        default: return type.toLowerCase().replace(/_/g, ' ');
    }
}

/**
 * Get primary relationship type from array of relation types
 * Prioritizes important relationship types for meta-graph coloring
 */
function getPrimaryRelationType(relationTypes: string[]): string {
    if (!relationTypes || relationTypes.length === 0) {
        return 'RELATED_TO';
    }

    // Priority order for relationship types (most important first)
    const priorityOrder = [
        'APPLIES_TO',      // Regulation applies to spatial units/land use
        'DEFINED_IN',      // Regulation/requirement defined in document
        'CONSTRAINS',      // Requirement constrains spatial unit
        'HAS_REQUIREMENT', // Regulation has requirement
        'LOCATED_IN',      // Spatial unit located in another
        'OVERRIDES',       // Document overrides another
        'REFINES',         // Document refines another
        'RELATED_TO'       // General relation (lowest priority)
    ];

    // Find the highest priority relationship type
    for (const priorityType of priorityOrder) {
        if (relationTypes.includes(priorityType)) {
            return priorityType;
        }
    }

    // Fallback to first relation type
    return relationTypes[0];
}

/**
 * Get edge color for meta-graph edges based on relationship types
 * Uses primary relationship type with opacity/weight consideration
 */
function getMetaEdgeColor(primaryRelation: string, _relationTypes: string[], _weight: number): string {
    // Base colors for relationship types (consistent with KnowledgeGraphVisualizer)
    const colorMap: Record<string, string> = {
        'APPLIES_TO': '#3b82f6',      // blue-500 - Regulation applies to spatial/land use
        'DEFINED_IN': '#10b981',      // green-500 - Defined in document
        'CONSTRAINS': '#f59e0b',      // amber-500 - Constrains spatial unit
        'HAS_REQUIREMENT': '#ef4444', // red-500 - Has requirement
        'LOCATED_IN': '#8b5cf6',      // purple-500 - Spatial location
        'OVERRIDES': '#dc2626',       // red-600 - Document override
        'REFINES': '#06b6d4',         // cyan-500 - Document refinement
        'RELATED_TO': '#94a3b8'       // slate-400 - General relation
    };

    // Get base color for primary relationship type
    const baseColor = colorMap[primaryRelation] || colorMap['RELATED_TO'];

    // For meta-graph edges, we can adjust opacity based on:
    // - Number of relationship types (more types = more important connection)
    // - Edge weight (higher weight = stronger connection)
    // But NVL uses solid colors, so we'll use the base color
    // Width is already adjusted based on weight in the relationship definition
    
    return baseColor;
}


