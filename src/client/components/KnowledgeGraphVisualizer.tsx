import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    MarkerType,
    NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { LayoutAlgorithm } from './LayoutSelector';
import { LayoutSelector } from './LayoutSelector';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Filter, ChevronDown, ChevronRight, Layers, AlertCircle } from 'lucide-react';
import { logError } from '../utils/errorHandler';
import { api } from '../services/api';
import { t } from '../utils/i18n';
import { DEFAULT_NODE_TYPES, DEFAULT_EDGE_TYPES } from '../utils/reactFlowConstants';

interface KGNode {
    id: string;
    type: string;
    name: string;
    description?: string;
    [key: string]: unknown;
}

// KGEdge interface removed - unused

interface KnowledgeClusterNode {
    id: string;
    label: string;
    type: 'knowledge-cluster';
    clusterType: 'entity-type' | 'domain' | 'jurisdiction' | 'category';
    level: number;
    nodeCount: number;
    entityIds: string[];
    representativeEntity?: KGNode;
    metadata: {
        entityType?: string;
        domain?: string;
        jurisdiction?: string;
        category?: string;
    };
}

interface KnowledgeMetaEdge {
    source: string;
    target: string;
    weight: number;
    relationTypes: string[];
}

interface MetaGraphData {
    clusters: { [id: string]: KnowledgeClusterNode };
    edges: KnowledgeMetaEdge[];
    totalNodes: number;
    totalClusters: number;
    metadata: {
        clusteringStrategy: string;
        entityTypeDistribution: Record<string, number>;
    };
}

interface ClusterDetailResponse {
    cluster: KnowledgeClusterNode;
    entities: KGNode[];
    entityCount: number;
}

// Filter types
type RelationTypeFilter = 'ALL' | 'APPLIES_TO' | 'CONSTRAINS' | 'DEFINED_IN' | 'LOCATED_IN' | 'HAS_REQUIREMENT' | 'RELATED_TO';
type EntityTypeFilter = 'ALL' | 'PolicyDocument' | 'Regulation' | 'SpatialUnit' | 'LandUse' | 'Requirement' | 'Concept';

// Increased node size for readability
const nodeWidth = 280;
const nodeHeight = 140;
const EXPANDED_CLUSTER_PREFIX = 'expanded-cluster-';

const getTypeColor = (type: string) => {
    switch (type) {
        case 'PolicyDocument': return '#2563eb'; // blue-600
        case 'Regulation': return '#dc2626'; // red-600
        case 'SpatialUnit': return '#16a34a'; // green-600
        case 'LandUse': return '#d97706'; // amber-600
        case 'Requirement': return '#9333ea'; // purple-600
        default: return '#64748b'; // slate-500
    }
};

const getClusterColor = (clusterType: string, metadata: KnowledgeClusterNode['metadata']): string => {
    if (clusterType === 'entity-type') {
        const entityType = metadata.entityType;
        return getTypeColor(entityType || 'default');
    }
    if (clusterType === 'domain') {
        return '#3b82f6'; // blue-500
    }
    if (clusterType === 'jurisdiction') {
        return '#10b981'; // green-500
    }
    return '#8b5cf6'; // purple-500
};

const getEdgeLabel = (type: string) => {
    switch (type) {
        case 'DEFINED_IN': return t('kgVisualizer.relationType.definedIn');
        case 'APPLIES_TO': return t('kgVisualizer.relationType.appliesTo');
        case 'LOCATED_IN': return t('kgVisualizer.relationType.locatedIn');
        case 'CONSTRAINS': return t('kgVisualizer.relationType.constrains');
        case 'HAS_REQUIREMENT': return t('kgVisualizer.relationType.hasRequirement');
        case 'RELATED_TO': return t('kgVisualizer.relationType.relatedTo');
        default: return type.toLowerCase().replace(/_/g, ' ');
    }
};

function KnowledgeGraphVisualizerInner() {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metaGraphData, setMetaGraphData] = useState<MetaGraphData | null>(null);
    const [backend, setBackend] = useState<'graphdb' | 'neo4j' | null>(null);
    const [kgEnabled, setKgEnabled] = useState(true);
    
    // Level-of-detail: Track expanded clusters
    const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
    const [loadingClusters, setLoadingClusters] = useState<Set<string>>(new Set());
    const [clusterEntities, setClusterEntities] = useState<Map<string, KGNode[]>>(new Map());
    
    // Filtering state
    const [showFilters, setShowFilters] = useState(false);
    const [relationTypeFilter, setRelationTypeFilter] = useState<RelationTypeFilter>('ALL');
    const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>('ALL');
    const [jurisdictionFilter, setJurisdictionFilter] = useState<string>('ALL');
    const [minWeightFilter, setMinWeightFilter] = useState<number>(0);
    
    // Layout state - default to grid for clean, organized layout
    const [currentLayout, setCurrentLayout] = useState<LayoutAlgorithm>('dagre'); // Use hierarchical as default grid-like layout
    
    const { fitView } = useReactFlow();
    
    // Progressive loading: Load cluster entities on-demand
    // Define these early to avoid forward reference issues
    const expandCluster = useCallback(async (clusterId: string) => {
        if (expandedClusters.has(clusterId) || loadingClusters.has(clusterId)) {
            return;
        }

        setLoadingClusters(prev => new Set(prev).add(clusterId));
        
        try {
            // Use API service instead of direct fetch
            const response = await api.graph.getClusterEntities(clusterId, {
                strategy: 'gds-louvain',
                minClusterSize: 5,
            });
            
            // Convert API response to component's expected format
            const data: ClusterDetailResponse = {
                cluster: metaGraphData?.clusters[clusterId] || {
                    id: clusterId,
                    label: clusterId,
                    type: 'knowledge-cluster',
                    clusterType: 'entity-type',
                    level: 0,
                    nodeCount: response.entityCount,
                    entityIds: response.entities.map(e => e.id),
                    metadata: {},
                },
                entities: response.entities.map(entity => ({
                    id: entity.id,
                    type: entity.type,
                    name: entity.name,
                    properties: entity.properties,
                })),
                entityCount: response.entityCount,
            };
            
            setClusterEntities(prev => new Map(prev).set(clusterId, data.entities));
            setExpandedClusters(prev => new Set(prev).add(clusterId));
        } catch (error) {
            logError(error, 'expand-cluster');
        } finally {
            setLoadingClusters(prev => {
                const next = new Set(prev);
                next.delete(clusterId);
                return next;
            });
        }
    }, [expandedClusters, loadingClusters, metaGraphData]);

    const collapseCluster = useCallback((clusterId: string) => {
        setExpandedClusters(prev => {
            const next = new Set(prev);
            next.delete(clusterId);
            return next;
        });
        setClusterEntities(prev => {
            const next = new Map(prev);
            next.delete(clusterId);
            return next;
        });
    }, []);
    
    // Define handleNodeClick before useMemo to avoid forward reference
    const handleNodeClick: NodeMouseHandler = useCallback((_event: React.MouseEvent, node: Node) => {
        // Handle cluster expansion/collapse
        if (node.data?.clusterId && !node.id.startsWith(EXPANDED_CLUSTER_PREFIX)) {
            const clusterId = node.data.clusterId;
            if (expandedClusters.has(clusterId)) {
                collapseCluster(clusterId);
            } else {
                expandCluster(clusterId);
            }
        }
    }, [expandedClusters, expandCluster, collapseCluster]);
    
    // Memoize ReactFlow props to ensure stable references
    const reactFlowProps = useMemo(() => ({
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onNodeClick: handleNodeClick,
        nodeTypes: DEFAULT_NODE_TYPES,
        edgeTypes: DEFAULT_EDGE_TYPES,
        fitView: true,
        attributionPosition: 'bottom-right' as const,
        minZoom: 0.1,
        maxZoom: 2,
        onlyRenderVisibleElements: true,
    }), [nodes, edges, onNodesChange, onEdgesChange, handleNodeClick]);
    
    // Store calculated positions to separate layout calculation (expensive) from rendering (cheap)
    const [layoutResult, setLayoutResult] = useState<{
        positions: Map<string, { x: number; y: number }>;
        nodeIds: string[];
    } | null>(null);

    // Fetch meta-graph (clusters) - defined early to avoid forward reference issues
    const fetchMetaGraph = useCallback(async () => {
        try {
            setIsLoading(true);

            // Check feature flags first
            try {
                const flags = await api.workflowConfiguration.getAvailableFeatureFlags();
                const kgEnabledFlag = flags.find(f => f.name === 'KG_ENABLED');
                if (kgEnabledFlag && !kgEnabledFlag.currentValue) {
                    setKgEnabled(false);
                    setIsLoading(false);
                    return; // Stop here
                }
            } catch (err) {
                console.warn('Failed to check feature flags:', err);
            }

            // Use API service instead of direct fetch
            const response = await api.graph.getKnowledgeGraphMeta({
                strategy: 'gds-louvain',
                minClusterSize: 3,
            });
            
            // Convert API response to component's expected format
            // Map ClusterNode to KnowledgeClusterNode
            const clusters: { [id: string]: KnowledgeClusterNode } = {};
            Object.entries(response.clusters).forEach(([id, clusterNode]) => {
                clusters[id] = {
                    id: clusterNode.id,
                    label: clusterNode.label,
                    type: 'knowledge-cluster',
                    clusterType: 'entity-type', // Default, API doesn't provide this
                    level: 0, // Default, API doesn't provide this
                    nodeCount: clusterNode.nodeCount,
                    entityIds: clusterNode.children || [], // Use children as entityIds
                    metadata: {},
                };
            });
            
            // Store backend info if available
            if (response.backend) {
                setBackend(response.backend);
            }
            
            const data: MetaGraphData = {
                clusters,
                edges: response.edges.map(edge => ({
                    source: edge.source,
                    target: edge.target,
                    weight: edge.weight,
                    relationTypes: [], // API doesn't return relationTypes, will be empty
                })),
                totalNodes: response.totalNodes,
                totalClusters: response.totalClusters,
                metadata: {
                    clusteringStrategy: 'gds-louvain',
                    entityTypeDistribution: {},
                },
            };
            
            if (!data.clusters || Object.keys(data.clusters).length === 0) {
                console.warn('Knowledge graph is empty. Run a workflow or seed script to populate it.');
                setIsLoading(false);
                return;
            }
            
            setMetaGraphData(data);
        } catch (error) {
            logError(error, 'fetch-meta-knowledge-graph');
            setIsLoading(false);
        }
    }, []);

    // Fetch meta-graph on mount
    useEffect(() => {
        fetchMetaGraph();
    }, [fetchMetaGraph]);

    // Dynamic edge limit based on number of clusters/nodes
    // Rule: max edges = clusters * 10 (reasonable ratio for knowledge graphs)
    // Absolute maximum: 10,000 edges (safety limit to prevent wild growth)
    const getMaxEdges = useCallback((clusterCount: number) => {
        const ratioBasedLimit = clusterCount * 10;
        const absoluteMax = 10000; // Safety limit
        return Math.min(ratioBasedLimit, absoluteMax);
    }, []);
    
    // Apply filters to edges and intelligently limit to prevent wild growth
    const filteredEdges = useMemo(() => {
        if (!metaGraphData) return [];
        
        const edges = metaGraphData.edges.filter(edge => {
            // Filter by relationship type
            if (relationTypeFilter !== 'ALL' && !edge.relationTypes.includes(relationTypeFilter)) {
                return false;
            }
            
            // Filter by weight
            if (edge.weight < minWeightFilter) {
                return false;
            }
            
            // Filter by entity types in clusters
            if (entityTypeFilter !== 'ALL') {
                const sourceCluster = metaGraphData.clusters[edge.source];
                const targetCluster = metaGraphData.clusters[edge.target];
                if (sourceCluster?.metadata.entityType !== entityTypeFilter && 
                    targetCluster?.metadata.entityType !== entityTypeFilter) {
                    return false;
                }
            }
            
            // Filter by jurisdiction
            if (jurisdictionFilter !== 'ALL') {
                const sourceCluster = metaGraphData.clusters[edge.source];
                const targetCluster = metaGraphData.clusters[edge.target];
                if (sourceCluster?.metadata.jurisdiction !== jurisdictionFilter && 
                    targetCluster?.metadata.jurisdiction !== jurisdictionFilter) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Calculate dynamic limit based on cluster count
        const clusterCount = Object.keys(metaGraphData.clusters).length;
        const maxEdges = getMaxEdges(clusterCount);
        
        // If we're under the limit, return all filtered edges
        if (edges.length <= maxEdges) {
            return edges;
        }
        
        // Sort by importance (weight + relationship type priority) only if we need to limit
        const relationshipPriority: Record<string, number> = {
            'APPLIES_TO': 5,
            'DEFINED_IN': 4,
            'CONSTRAINS': 3,
            'HAS_REQUIREMENT': 3,
            'LOCATED_IN': 2,
            'RELATED_TO': 1
        };
        
        edges.sort((a, b) => {
            // Primary sort: by weight
            if (b.weight !== a.weight) {
                return b.weight - a.weight;
            }
            // Secondary sort: by relationship type priority
            const aPriority = Math.max(...(a.relationTypes?.map(t => relationshipPriority[t] || 0) || [0]));
            const bPriority = Math.max(...(b.relationTypes?.map(t => relationshipPriority[t] || 0) || [0]));
            return bPriority - aPriority;
        });
        
        // Limit to most important edges (only if exceeding reasonable ratio)
        const limitedEdges = edges.slice(0, maxEdges);
        return limitedEdges;
    }, [metaGraphData, relationTypeFilter, entityTypeFilter, jurisdictionFilter, minWeightFilter, getMaxEdges]);

    // Get unique jurisdictions for filter
    const jurisdictions = useMemo(() => {
        if (!metaGraphData) return [];
        const jurs = new Set<string>();
        Object.values(metaGraphData.clusters).forEach(cluster => {
            if (cluster.metadata.jurisdiction) {
                jurs.add(cluster.metadata.jurisdiction);
            }
        });
        return Array.from(jurs).sort();
    }, [metaGraphData]);

    // Maximum nodes to process in layout (prevent crashes)
    const MAX_LAYOUT_NODES = 500;
    
    // Force-directed layout simulation (like D3 force)
    const applyForceDirectedLayout = useCallback((
        nodeIds: string[],
        edges: Array<{ source: string; target: string; weight: number }>,
        width: number = 2000,
        height: number = 1500,
        iterations: number = 100 // Reduced from 300 for performance
    ): Map<string, { x: number; y: number }> => {
        // Limit nodes for layout to prevent crashes
        if (nodeIds.length > MAX_LAYOUT_NODES) {
            console.warn(`[KG Layout] Limiting layout to ${MAX_LAYOUT_NODES} nodes (from ${nodeIds.length})`);
            nodeIds = nodeIds.slice(0, MAX_LAYOUT_NODES);
        }
        const positions = new Map<string, { x: number; y: number }>();
        const velocities = new Map<string, { x: number; y: number }>();
        
        // Initialize positions randomly in center
        nodeIds.forEach(id => {
            positions.set(id, {
                x: width / 2 + (Math.random() - 0.5) * width * 0.3,
                y: height / 2 + (Math.random() - 0.5) * height * 0.3
            });
            velocities.set(id, { x: 0, y: 0 });
        });

        // Force simulation
        const k = Math.sqrt((width * height) / nodeIds.length); // Optimal distance
        const alpha = 1.0;
        const alphaDecay = 0.0228;
        let currentAlpha = alpha;

        for (let i = 0; i < iterations; i++) {
            // Repulsion force (nodes repel each other)
            for (let j = 0; j < nodeIds.length; j++) {
                const nodeA = nodeIds[j];
                const posA = positions.get(nodeA)!;
                let fx = 0, fy = 0;

                for (let k = 0; k < nodeIds.length; k++) {
                    if (j === k) continue;
                    const nodeB = nodeIds[k];
                    const posB = positions.get(nodeB)!;
                    const dx = posA.x - posB.x;
                    const dy = posA.y - posB.y;
                    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                    const force = (k * k) / distance;
                    fx += (dx / distance) * force;
                    fy += (dy / distance) * force;
                }

                // Attraction force (edges pull nodes together)
                edges.forEach(edge => {
                    if (edge.source === nodeA || edge.target === nodeA) {
                        const otherId = edge.source === nodeA ? edge.target : edge.source;
                        const posB = positions.get(otherId);
                        if (posB) {
                            const dx = posA.x - posB.x;
                            const dy = posA.y - posB.y;
                            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                            const force = (distance * distance) / k * (1 + edge.weight * 0.1);
                            fx -= (dx / distance) * force;
                            fy -= (dy / distance) * force;
                        }
                    }
                });

                // Apply velocity
                const vel = velocities.get(nodeA)!;
                vel.x = (vel.x + fx * currentAlpha) * 0.6; // Damping
                vel.y = (vel.y + fy * currentAlpha) * 0.6;
                posA.x += vel.x;
                posA.y += vel.y;

                // Keep nodes within bounds
                posA.x = Math.max(nodeWidth / 2, Math.min(width - nodeWidth / 2, posA.x));
                posA.y = Math.max(nodeHeight / 2, Math.min(height - nodeHeight / 2, posA.y));
            }

            currentAlpha *= (1 - alphaDecay);
        }

        return positions;
    }, []);

    // Snap positions to grid and prevent overlaps
    const snapToGridAndPreventOverlaps = useCallback((
        positions: Map<string, { x: number; y: number }>,
        nodeIds: string[]
    ): Map<string, { x: number; y: number }> => {
        const gridSize = nodeWidth + 30; // Grid cell size
        const newPositions = new Map<string, { x: number; y: number }>();
        const occupied = new Set<string>(); // Track occupied grid cells
        
        nodeIds.forEach(nodeId => {
            const pos = positions.get(nodeId) || { x: 0, y: 0 };
            
            // Snap to grid
            const gridX = Math.round(pos.x / gridSize) * gridSize;
            const gridY = Math.round(pos.y / gridSize) * gridSize;
            
            // Check for overlap and adjust
            let finalX = gridX;
            let finalY = gridY;
            let cellKey = `${finalX},${finalY}`;
            let offset = 0;
            
            // Find nearest unoccupied grid cell
            while (occupied.has(cellKey) && offset < 100) {
                offset++;
                // Try positions in a spiral pattern
                const attempts = [
                    { x: gridX + offset * gridSize, y: gridY },
                    { x: gridX - offset * gridSize, y: gridY },
                    { x: gridX, y: gridY + offset * gridSize },
                    { x: gridX, y: gridY - offset * gridSize },
                    { x: gridX + offset * gridSize, y: gridY + offset * gridSize },
                    { x: gridX - offset * gridSize, y: gridY - offset * gridSize },
                ];
                
                let found = false;
                for (const attempt of attempts) {
                    cellKey = `${attempt.x},${attempt.y}`;
                    if (!occupied.has(cellKey)) {
                        finalX = attempt.x;
                        finalY = attempt.y;
                        found = true;
                        break;
                    }
                }
                
                if (!found && offset >= 10) break; // Give up after reasonable attempts
            }
            
            occupied.add(cellKey);
            newPositions.set(nodeId, { x: finalX, y: finalY });
        });
        
        return newPositions;
    }, []);
    
    // Prevent overlaps by adjusting positions
    const preventOverlaps = useCallback((
        positions: Map<string, { x: number; y: number }>,
        nodeIds: string[]
    ): Map<string, { x: number; y: number }> => {
        const newPositions = new Map(positions);
        const minDistance = nodeWidth + 20; // Minimum distance between nodes
        
        // Check each pair of nodes for overlap
        for (let i = 0; i < nodeIds.length; i++) {
            const nodeA = nodeIds[i];
            const posA = newPositions.get(nodeA)!;
            
            for (let j = i + 1; j < nodeIds.length; j++) {
                const nodeB = nodeIds[j];
                const posB = newPositions.get(nodeB)!;
                
                const dx = posA.x - posB.x;
                const dy = posA.y - posB.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < minDistance && distance > 0) {
                    // Nodes overlap - push them apart
                    const overlap = minDistance - distance;
                    const angle = Math.atan2(dy, dx);
                    const pushX = Math.cos(angle) * overlap * 0.5;
                    const pushY = Math.sin(angle) * overlap * 0.5;
                    
                    const newPosA = {
                        x: posA.x + pushX,
                        y: posA.y + pushY
                    };
                    const newPosB = {
                        x: posB.x - pushX,
                        y: posB.y - pushY
                    };
                    
                    newPositions.set(nodeA, newPosA);
                    newPositions.set(nodeB, newPosB);
                }
            }
        }
        
        return newPositions;
    }, []);
    
    // Circular/concentric layout
    const applyCircularLayout = useCallback((
        nodeIds: string[],
        edges: Array<{ source: string; target: string; weight: number }>,
        centerX: number = 1000,
        centerY: number = 750,
        radius: number = 400
    ): Map<string, { x: number; y: number }> => {
        const positions = new Map<string, { x: number; y: number }>();
        const nodeCount = nodeIds.length;
        const angleStep = (2 * Math.PI) / nodeCount;

        // Calculate node degrees (connectivity) for concentric placement
        const degrees = new Map<string, number>();
        nodeIds.forEach(id => degrees.set(id, 0));
        edges.forEach(edge => {
            degrees.set(edge.source, (degrees.get(edge.source) || 0) + edge.weight);
            degrees.set(edge.target, (degrees.get(edge.target) || 0) + edge.weight);
        });

        // Sort nodes by degree (most connected in center)
        const sortedNodes = [...nodeIds].sort((a, b) => 
            (degrees.get(b) || 0) - (degrees.get(a) || 0)
        );

        // Place nodes in concentric circles
        sortedNodes.forEach((nodeId, index) => {
            const degree = degrees.get(nodeId) || 0;
            const maxDegree = Math.max(...Array.from(degrees.values()));
            const normalizedDegree = maxDegree > 0 ? degree / maxDegree : 0;
            
            // Inner circle for highly connected nodes, outer for less connected
            const nodeRadius = radius * (0.3 + normalizedDegree * 0.7);
            const angle = index * angleStep;
            
            positions.set(nodeId, {
                x: centerX + Math.cos(angle) * nodeRadius,
                y: centerY + Math.sin(angle) * nodeRadius
            });
        });

        return positions;
    }, []);

    // Calculate layout (expensive) - only re-run when graph structure or layout algorithm changes
    const calculateGraphLayout = useCallback(() => {
        if (!metaGraphData) return;

        try {
            // Limit number of clusters to display for readability
            const MAX_CLUSTERS_TO_DISPLAY = 30;
            const allClusterIds = Object.keys(metaGraphData.clusters);
            const clustersToDisplay = allClusterIds.slice(0, MAX_CLUSTERS_TO_DISPLAY);
            
            if (allClusterIds.length > MAX_CLUSTERS_TO_DISPLAY) {
                console.warn(`[KG Layout] Limiting display to ${MAX_CLUSTERS_TO_DISPLAY} clusters (out of ${allClusterIds.length})`);
            }
            
            const nodeIds: string[] = [];
            const layoutEdges: Array<{ source: string; target: string; weight: number }> = [];

            // Collect cluster nodes (only display limited number)
            clustersToDisplay.forEach(clusterId => {
                const cluster = metaGraphData.clusters[clusterId];
                if (cluster) {
                    nodeIds.push(cluster.id);
                }
            });

            // Collect expanded cluster entities
            expandedClusters.forEach(clusterId => {
                const entities = clusterEntities.get(clusterId);
                if (entities) {
                    entities.forEach(entity => {
                        const expandedNodeId = `${EXPANDED_CLUSTER_PREFIX}${clusterId}-${entity.id}`;
                        nodeIds.push(expandedNodeId);
                    });
                }
            });

            // Collect edges between clusters (only for displayed clusters)
            filteredEdges.forEach((edge) => {
                if (clustersToDisplay.includes(edge.source) && clustersToDisplay.includes(edge.target) &&
                    metaGraphData.clusters[edge.source] && metaGraphData.clusters[edge.target] && edge.weight > 0) {
                    layoutEdges.push({ source: edge.source, target: edge.target, weight: edge.weight });
                }
            });

            // Collect edges from clusters to expanded entities
            expandedClusters.forEach(clusterId => {
                const entities = clusterEntities.get(clusterId);
                if (entities) {
                    entities.forEach(entity => {
                        const expandedNodeId = `${EXPANDED_CLUSTER_PREFIX}${clusterId}-${entity.id}`;
                        layoutEdges.push({ source: clusterId, target: expandedNodeId, weight: 1 });
                    });
                }
            });

            // Limit layout edges to prevent performance issues
            const maxLayoutEdges = Math.min(layoutEdges.length, 2000);
            const limitedLayoutEdges = layoutEdges.slice(0, maxLayoutEdges);
            
            // Apply layout algorithm
            let positions: Map<string, { x: number; y: number }>;
            
            if (currentLayout === 'force') {
                positions = applyForceDirectedLayout(nodeIds, limitedLayoutEdges);
            } else if (currentLayout === 'circular') {
                positions = applyCircularLayout(nodeIds, limitedLayoutEdges);
            } else {
                // EXPLICIT 2D GRID LAYOUT - arranges nodes in rows and columns
                const gridColumns = Math.ceil(Math.sqrt(nodeIds.length)); // Calculate columns for roughly square grid
                const gridSpacingX = nodeWidth + 50; // Horizontal spacing between nodes
                const gridSpacingY = nodeHeight + 50; // Vertical spacing between nodes
                const startX = 100; // Starting X position
                const startY = 100; // Starting Y position
                
                positions = new Map();
                
                nodeIds.forEach((id, index) => {
                    const col = index % gridColumns;
                    const row = Math.floor(index / gridColumns);
                    
                    const x = startX + (col * gridSpacingX);
                    const y = startY + (row * gridSpacingY);
                    
                    positions.set(id, { x, y });
                });

                // Post-process: ensure no overlaps (safety check)
                positions = preventOverlaps(positions, nodeIds);
            }

            // Apply overlap prevention to all layouts
            if (currentLayout === 'force' || currentLayout === 'circular') {
                positions = snapToGridAndPreventOverlaps(positions, nodeIds);
            }

            setLayoutResult({ positions, nodeIds });

        } catch (error) {
            logError(error, 'kg-layout-calculation');
            setIsLoading(false);
            setError('Failed to layout graph. Try reducing the number of clusters or using filters.');
        }
    }, [metaGraphData, expandedClusters, clusterEntities, filteredEdges, currentLayout, applyForceDirectedLayout, applyCircularLayout, preventOverlaps, snapToGridAndPreventOverlaps]);

    // Render graph (cheap) - re-run when layout positions or display settings change
    const renderGraph = useCallback(() => {
        if (!metaGraphData || !layoutResult) return;
        
        const { positions } = layoutResult;
        
        try {
            const allNodes: Node[] = [];
            const allEdges: Edge[] = [];

            // Limit number of clusters to display for readability
            const MAX_CLUSTERS_TO_DISPLAY = 30;
            const allClusterIds = Object.keys(metaGraphData.clusters);
            const clustersToDisplay = allClusterIds.slice(0, MAX_CLUSTERS_TO_DISPLAY);

            // Create cluster nodes (only display limited number)
            clustersToDisplay.forEach(clusterId => {
                const cluster = metaGraphData.clusters[clusterId];
                if (!cluster) return;
                const nodePosition = positions.get(cluster.id) || { x: 0, y: 0 };
                
                // Skip viewport culling for grid layout - we want to show all nodes in the grid
                
                const clusterColor = getClusterColor(cluster.clusterType, cluster.metadata);
                const isExpanded = expandedClusters.has(cluster.id);
                const isLoading = loadingClusters.has(cluster.id);

                allNodes.push({
                    id: cluster.id,
                    type: 'default',
                    position: {
                        x: nodePosition.x - nodeWidth / 2,
                        y: nodePosition.y - nodeHeight / 2,
                    },
                    data: {
                        label: (
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1 mb-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isExpanded) {
                                                collapseCluster(cluster.id);
                                            } else {
                                                expandCluster(cluster.id);
                                            }
                                        }}
                                        className="text-xs hover:bg-slate-200 rounded p-0.5 transition-colors"
                                        disabled={isLoading}
                                        aria-label={isExpanded ? t('kgVisualizer.collapseCluster') : t('kgVisualizer.expandCluster')}
                                    >
                                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>
                                    <div className="font-bold text-xs uppercase opacity-75">
                                        {cluster.clusterType === 'entity-type' ? t('kgVisualizer.clusterType.type') :
                                         cluster.clusterType === 'domain' ? t('kgVisualizer.clusterType.domain') :
                                         cluster.clusterType === 'jurisdiction' ? t('kgVisualizer.clusterType.jurisdiction') : t('kgVisualizer.clusterType.category')}
                                    </div>
                                </div>
                                <div className="text-sm font-semibold leading-tight text-gray-900 break-words px-1">
                                    {cluster.label || `Cluster ${cluster.id.replace('gds-louvain-', '')}`}
                                </div>
                                {cluster.label && !cluster.label.startsWith('Cluster') && (
                                    <div className="text-[10px] text-blue-600 mt-0.5 px-1 font-medium">
                                        {t('kgVisualizer.semanticLabel')}
                                    </div>
                                )}
                                <div className="text-xs text-slate-500 mt-1">
                                    {cluster.nodeCount} {cluster.nodeCount === 1 ? t('kgVisualizer.entity') : t('kgVisualizer.entities')}
                                </div>
                                {cluster.metadata.entityType && (
                                    <div className="text-xs text-slate-400 mt-0.5">
                                        {cluster.metadata.entityType}
                                    </div>
                                )}
                                {isLoading && <div className="text-xs text-blue-500 mt-1">{t('kgVisualizer.loading')}</div>}
                            </div>
                        ),
                        clusterId: cluster.id,
                        cluster
                    },
                    style: {
                        background: 'white',
                        border: `3px solid ${clusterColor}`,
                        borderRadius: '8px',
                        width: nodeWidth,
                        padding: '10px',
                        fontSize: '12px',
                        color: '#1e293b',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    },
                });
            });

            // Create expanded entity nodes
            expandedClusters.forEach(clusterId => {
                const entities = clusterEntities.get(clusterId);
                if (entities) {
                    entities.forEach(entity => {
                        const expandedNodeId = `${EXPANDED_CLUSTER_PREFIX}${clusterId}-${entity.id}`;
                        const nodePosition = positions.get(expandedNodeId) || { x: 0, y: 0 };

                        allNodes.push({
                                id: expandedNodeId,
                                type: 'default',
                                position: {
                                    x: nodePosition.x - nodeWidth / 2,
                                    y: nodePosition.y - nodeHeight / 2,
                                },
                                data: {
                                    label: (
                                        <div className="text-center">
                                            <div className="font-bold text-xs uppercase mb-1 opacity-75">{entity.type}</div>
                                            <div className="text-sm font-semibold leading-tight">{entity.name}</div>
                                        </div>
                                    ),
                                    entityId: entity.id,
                                    clusterId: clusterId
                                },
                                style: {
                                    background: 'white',
                                    border: `2px solid ${getTypeColor(entity.type)}`,
                                    borderRadius: '8px',
                                    width: nodeWidth,
                                    padding: '10px',
                                    fontSize: '12px',
                                    color: '#1e293b',
                                    boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)',
                                    opacity: 0.9,
                                },
                            });
                    });
                }
            });

            // All nodes are now passed to ReactFlow, let it handle visibility
            const validNodeIds = new Set(allNodes.map(n => n.id));

            // Create edges with meaningful labels
            const edgesToRender = filteredEdges.filter((edge) => {
                // Basic filters
                if (!metaGraphData.clusters[edge.source] || !metaGraphData.clusters[edge.target] || edge.weight <= 0) {
                    return false;
                }
                // Only show edges between valid nodes (e.g. if cluster hidden or something)
                return validNodeIds.has(edge.source) && validNodeIds.has(edge.target);
            });

            edgesToRender.forEach((edge, i) => {
                    // Show relationship types as edge labels
                    const relTypeLabels = edge.relationTypes?.map(t => getEdgeLabel(t)).join(', ') || '';
                    const weightLabel = edge.weight > 1 ? `${edge.weight}x` : '';
                    const label = relTypeLabels || weightLabel || undefined;

                    // Determine edge color based on relationship types
                    const primaryRelation = edge.relationTypes?.[0];
                    let edgeColor = '#94a3b8'; // default gray
                    if (primaryRelation === 'APPLIES_TO') edgeColor = '#3b82f6'; // blue
                    else if (primaryRelation === 'DEFINED_IN') edgeColor = '#10b981'; // green
                    else if (primaryRelation === 'CONSTRAINS') edgeColor = '#f59e0b'; // amber
                    else if (primaryRelation === 'LOCATED_IN') edgeColor = '#8b5cf6'; // purple
                    else if (primaryRelation === 'HAS_REQUIREMENT') edgeColor = '#ef4444'; // red

                    allEdges.push({
                        id: `e-${edge.source}-${edge.target}-${i}`,
                        source: edge.source,
                        target: edge.target,
                        label: label ? (
                            <div className="bg-white px-1.5 py-0.5 rounded text-xs border border-gray-200 shadow-sm">
                                {label}
                            </div>
                        ) : undefined,
                        type: currentLayout === 'circular' ? 'straight' : 'smoothstep',
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: edgeColor,
                            width: 20,
                            height: 20,
                        },
                        style: { 
                            stroke: edgeColor,
                            strokeWidth: Math.min(Math.max(2, Math.log(edge.weight + 1) * 1.5), 6),
                            opacity: Math.min(0.5 + (edge.weight / 50), 0.9)
                        },
                        labelStyle: { fill: '#1e293b', fontSize: 11, fontWeight: 500 },
                        labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
                    });
                });

            // Add edges from clusters to expanded entities
            expandedClusters.forEach(clusterId => {
                const entities = clusterEntities.get(clusterId);
                if (entities) {
                    entities.forEach((entity, i) => {
                        const expandedNodeId = `${EXPANDED_CLUSTER_PREFIX}${clusterId}-${entity.id}`;
                        allEdges.push({
                            id: `e-cluster-${clusterId}-${entity.id}-${i}`,
                            source: clusterId,
                            target: expandedNodeId,
                            type: 'smoothstep',
                            style: {
                                stroke: '#cbd5e1',
                                strokeWidth: 1,
                                strokeDasharray: '5,5',
                                opacity: 0.5
                            },
                        });
                    });
                }
            });

            setNodes(allNodes);
            setEdges(allEdges);
            setIsLoading(false);

            // Fit view only on initial render or major layout changes
            // We don't want to fit view when just panning/zooming (viewport changes)
        } catch (error) {
            logError(error, 'kg-render');
        }
    }, [metaGraphData, layoutResult, expandedClusters, clusterEntities, loadingClusters, filteredEdges, expandCluster, collapseCluster, setNodes, setEdges, currentLayout]);

    // Initial fit view
    useEffect(() => {
        if (!isLoading && layoutResult && metaGraphData) {
            setTimeout(() => {
                fitView({ padding: 0.2 });
            }, 100);
        }
    }, [layoutResult, metaGraphData, isLoading, fitView]);

    // Effect for calculating layout (expensive part)
    useEffect(() => {
        if (metaGraphData) {
            // Use setTimeout to allow UI to update before heavy calculation if needed
            // But since we are separating it from render, it might not block as much
            // Still good to defer to next tick
            const timer = setTimeout(() => {
                calculateGraphLayout();
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [calculateGraphLayout, metaGraphData]); // calculateGraphLayout dependencies handle the rest

    // Effect for rendering (viewport culling)
    useEffect(() => {
        renderGraph();
    }, [renderGraph]);

    if (!kgEnabled) {
        return (
            <div className="flex flex-col justify-center items-center h-64 gap-2 border border-slate-200 rounded-lg bg-slate-50">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div className="text-destructive font-semibold">{t('knowledgePage.kgDisabled')}</div>
                <div className="text-sm text-gray-600">{t('knowledgePage.kgDisabledDescription')}</div>
            </div>
        );
    }

    if (isLoading && !metaGraphData) {
        return <div className="flex justify-center items-center h-64">Laden...</div>;
    }
    
    if (error) {
        return (
            <div className="flex flex-col justify-center items-center h-64 gap-2">
                <div className="text-red-600 font-semibold">{t('kgVisualizer.errorLoading')}</div>
                <div className="text-sm text-gray-600">{error}</div>
                <Button onClick={() => { setError(null); fetchMetaGraph(); }} variant="outline">
                    Opnieuw proberen
                </Button>
            </div>
        );
    }

    return (
        <div className="h-[600px] w-full border border-slate-200 rounded-lg bg-slate-50 relative">
            {/* Filter Panel */}
            <div className="absolute top-2 left-2 z-10 bg-card rounded-lg shadow-2xl border-2 border-border p-3 max-w-xs opacity-100">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-600" />
                        <span className="text-sm font-semibold text-slate-700">{t('kgVisualizer.filters')}</span>
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="text-slate-500 hover:text-slate-700"
                        aria-label={showFilters ? t('kgVisualizer.hideFilters') : t('kgVisualizer.showFilters')}
                    >
                        {showFilters ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                </div>
                
                {showFilters && (
                    <div className="space-y-3 mt-2">
                        {/* Relationship Type Filter */}
                        <div>
                            <Label className="text-xs text-slate-600 mb-1 block">{t('kgVisualizer.relationType')}</Label>
                            <Select value={relationTypeFilter} onValueChange={(v) => setRelationTypeFilter(v as RelationTypeFilter)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">{t('kgVisualizer.allTypes')}</SelectItem>
                                    <SelectItem value="APPLIES_TO">{t('kgVisualizer.relationType.appliesTo')}</SelectItem>
                                    <SelectItem value="CONSTRAINS">{t('kgVisualizer.relationType.constrains')}</SelectItem>
                                    <SelectItem value="DEFINED_IN">{t('kgVisualizer.relationType.definedIn')}</SelectItem>
                                    <SelectItem value="LOCATED_IN">{t('kgVisualizer.relationType.locatedIn')}</SelectItem>
                                    <SelectItem value="HAS_REQUIREMENT">{t('kgVisualizer.relationType.hasRequirement')}</SelectItem>
                                    <SelectItem value="RELATED_TO">{t('kgVisualizer.relationType.relatedTo')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Entity Type Filter */}
                        <div>
                            <Label className="text-xs text-slate-600 mb-1 block">{t('kgVisualizer.entityType')}</Label>
                            <Select value={entityTypeFilter} onValueChange={(v) => setEntityTypeFilter(v as EntityTypeFilter)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">{t('kgVisualizer.allTypes')}</SelectItem>
                                    <SelectItem value="PolicyDocument">{t('kgVisualizer.entityType.policyDocument')}</SelectItem>
                                    <SelectItem value="Regulation">{t('kgVisualizer.entityType.regulation')}</SelectItem>
                                    <SelectItem value="SpatialUnit">{t('kgVisualizer.entityType.spatialUnit')}</SelectItem>
                                    <SelectItem value="LandUse">{t('kgVisualizer.entityType.landUse')}</SelectItem>
                                    <SelectItem value="Requirement">{t('kgVisualizer.entityType.requirement')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Jurisdiction Filter */}
                        {jurisdictions.length > 0 && (
                            <div>
                                <Label className="text-xs text-slate-600 mb-1 block">{t('kgVisualizer.jurisdiction')}</Label>
                                <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">{t('kgVisualizer.allJurisdictions')}</SelectItem>
                                        {jurisdictions.map(jur => (
                                            <SelectItem key={jur} value={jur}>{jur}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Min Weight Filter */}
                        <div>
                            <Label htmlFor="weight-filter" className="text-xs text-slate-600 mb-3 block">{t('kgVisualizer.minWeight')} {minWeightFilter}</Label>
                            <Slider
                                id="weight-filter"
                                min={0}
                                max={50}
                                step={1}
                                value={[minWeightFilter]}
                                onValueChange={(vals) => setMinWeightFilter(vals[0])}
                                className="w-full"
                                aria-label={t('kgVisualizer.filterMinWeight')}
                            />
                        </div>

                        {/* Reset Filters */}
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => {
                                setRelationTypeFilter('ALL');
                                setEntityTypeFilter('ALL');
                                setJurisdictionFilter('ALL');
                                setMinWeightFilter(0);
                            }}
                        >
                            {t('kgVisualizer.resetFilters')}
                        </Button>
                    </div>
                )}
            </div>

            {/* Layout Selector */}
            <div className="absolute top-2 right-2 z-10">
                <LayoutSelector currentLayout={currentLayout} onLayoutChange={setCurrentLayout} />
            </div>

            {/* Stats Panel */}
            {metaGraphData && (
                <div className="absolute top-2 right-2 z-10 bg-card rounded-lg shadow-2xl border-2 border-border px-3 py-1.5 text-xs text-foreground opacity-100" style={{ top: '60px' }}>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <Layers className="w-3 h-3" />
                            <span>
                                {metaGraphData.totalClusters} {t('kgVisualizer.clustersAndEntities').replace('{{entities}}', String(metaGraphData.totalNodes))}
                            </span>
                            {backend && (
                                <Badge 
                                    variant={backend === 'graphdb' ? 'default' : 'secondary'}
                                    className="text-xs ml-1"
                                    title={t('knowledgeGraph.usingBackend').replace('{{backend}}', backend === 'graphdb' ? t('common.graphDB') : t('common.neo4j'))}
                                >
                                    {backend === 'graphdb' ? 'GraphDB' : 'Neo4j'}
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                            <span>
                                <span data-testid="edge-count">{filteredEdges.length}</span> {t('kgVisualizer.edgesShown')}
                                {metaGraphData.edges.length > filteredEdges.length && (
                                    <span className="text-amber-600 ml-1" title={t('kgVisualizer.topEdgesTooltip')
                                        .replace('{{shown}}', String(filteredEdges.length))
                                        .replace('{{total}}', String(metaGraphData.edges.length))
                                        .replace('{{limit}}', String(getMaxEdges(Object.keys(metaGraphData.clusters).length)))}>
                                        {t('kgVisualizer.topEdgesOf')
                                            .replace('{{shown}}', String(filteredEdges.length))
                                            .replace('{{total}}', String(metaGraphData.edges.length))}
                                    </span>
                                )}
                            </span>
                        </div>
                        {expandedClusters.size > 0 && (
                            <div className="text-blue-600">
                                • {expandedClusters.size} {t('kgVisualizer.expanded')}
                            </div>
                        )}
                        {Object.values(metaGraphData.clusters).filter(c => c.label && !c.label.startsWith('Cluster')).length > 0 && (
                            <div className="text-green-600" title={t('kgVisualizer.semanticLabelsLoaded')}>
                                • {Object.values(metaGraphData.clusters).filter(c => c.label && !c.label.startsWith('Cluster')).length} {t('kgVisualizer.withLabels')}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div data-testid="react-flow">
                <ReactFlow {...reactFlowProps}>
                    <Background color="#cbd5e1" gap={16} />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
}

export function KnowledgeGraphVisualizer() {
    return (
        <ReactFlowProvider>
            <KnowledgeGraphVisualizerInner />
        </ReactFlowProvider>
    );
}
