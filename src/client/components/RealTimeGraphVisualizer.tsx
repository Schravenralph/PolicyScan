import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { DEFAULT_NODE_TYPES, DEFAULT_EDGE_TYPES } from '../utils/reactFlowConstants';
import { useSSE } from '../hooks/useSSE';

const MAX_NODES_TO_DISPLAY = 50;

interface GraphStreamNode {
    id: string;
    url: string;
    title: string;
    type: 'page' | 'section' | 'document';
    children: string[];
    lastVisited?: string;
    hasChildren?: boolean;
    childCount?: number;
    score?: number;
    depth?: number;
}

export interface GraphStreamData {
    runId: string;
    timestamp: string;
    nodes: GraphStreamNode[];
    childNodes?: GraphStreamNode[];
    edges: Array<{ source: string; target: string }>;
    stats: {
        totalNodes: number;
        totalEdges: number;
        displayedNode?: string;
        childCount?: number;
        navigatedCount?: number;
    };
    message?: string;
}

interface RealTimeGraphVisualizerProps {
    runId: string;
    onClose?: () => void;
}

const POLL_INTERVAL = 5000; // Poll every 5 seconds to reduce server load
const nodeWidth = 180;
const nodeHeight = 60;

function RealTimeGraphVisualizerInner({ runId, onClose }: RealTimeGraphVisualizerProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState<GraphStreamData['stats'] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [queryContext, setQueryContext] = useState<string | null>(null);
    const { fitView } = useReactFlow();
    
    // Memoize ReactFlow props to ensure stable references
    const reactFlowProps = useMemo(() => ({
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        nodeTypes: DEFAULT_NODE_TYPES,
        edgeTypes: DEFAULT_EDGE_TYPES,
        fitView: true,
        attributionPosition: 'bottom-left' as const,
        nodesDraggable: false,
        nodesConnectable: false,
        elementsSelectable: false,
        panOnDrag: true,
        zoomOnScroll: true,
        zoomOnPinch: true,
    }), [nodes, edges, onNodesChange, onEdgesChange]);
    
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const layoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fitViewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);
    const consecutive404CountRef = useRef(0);
    const MAX_404_ATTEMPTS = 6; // Stop after 6 consecutive 404s (30 seconds total)
    const [sseEnabled, setSseEnabled] = useState(true);
    const sseErrorCountRef = useRef(0);
    const MAX_SSE_ERRORS = 3; // Fall back to polling after 3 SSE errors
    const lastGraphDataRef = useRef<string | null>(null); // Track last graph data hash to prevent duplicate updates
    const updateDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const pendingGraphDataRef = useRef<GraphStreamData | null>(null);
    const lastUpdateTimeRef = useRef<number>(0);
    const UPDATE_DEBOUNCE_MS = 2000; // Only update graph every 2 seconds max
    const MIN_UPDATE_INTERVAL_MS = 1000; // Minimum time between updates

    /**
     * Calculate relevance score for a node
     * Uses combined scoring: semantic similarity (if query available) + connectivity + recency
     */
    const calculateRelevanceScore = useCallback((node: GraphStreamNode, allNodes: GraphStreamNode[], query: string | null): number => {
        let semanticScore = 0;
        let connectivityScore = 0;
        let recencyScore = 0;

        // 1. Semantic similarity (0.5 weight) - if query context is available
        if (query && query.trim().length > 0) {
            const queryLower = query.toLowerCase();
            const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
            const titleLower = (node.title || '').toLowerCase();
            const urlLower = node.url.toLowerCase();

            let matchScore = 0;
            for (const term of queryTerms) {
                if (titleLower.includes(term)) matchScore += 0.5;
                if (urlLower.includes(term)) matchScore += 0.3;
            }
            // Normalize to 0-1 range (assuming max 5 terms = max score of 2.5)
            semanticScore = Math.min(1, matchScore / 2.5);
        }

        // 2. Connectivity score (0.3 weight) - number of children/connections
        const childCount = node.children?.length || 0;
        const maxChildCount = Math.max(1, Math.max(...allNodes.map(n => n.children?.length || 0)));
        connectivityScore = Math.min(1, childCount / maxChildCount);

        // 3. Recency score (0.2 weight) - lastVisited timestamp
        if (node.lastVisited) {
            const lastVisitedTime = new Date(node.lastVisited).getTime();
            const now = Date.now();
            const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
            const age = now - lastVisitedTime;
            recencyScore = Math.max(0, 1 - (age / maxAge));
        } else {
            recencyScore = 0.1; // Small score for nodes without timestamp
        }

        // Combined score with weights
        if (query && query.trim().length > 0) {
            return semanticScore * 0.5 + connectivityScore * 0.3 + recencyScore * 0.2;
        } else {
            // If no query, use connectivity + recency only
            return connectivityScore * 0.6 + recencyScore * 0.4;
        }
    }, []);

    /**
     * Filter nodes to top N by relevance score
     */
    const filterTopNodes = useCallback((allNodes: GraphStreamNode[], query: string | null, maxNodes: number): GraphStreamNode[] => {
        if (allNodes.length <= maxNodes) {
            return allNodes;
        }

        // Calculate relevance scores for all nodes
        const nodesWithScores = allNodes.map(node => ({
            node,
            score: calculateRelevanceScore(node, allNodes, query)
        }));

        // Sort by score (descending) and take top N
        nodesWithScores.sort((a, b) => b.score - a.score);

        // Always include start node (depth 0) if it exists
        const startNode = allNodes.find(n => n.depth === 0);
        const topNodes = nodesWithScores.slice(0, maxNodes).map(item => item.node);
        
        if (startNode && !topNodes.some(n => n.id === startNode.id)) {
            // Replace last node with start node if it's not already included
            topNodes[topNodes.length - 1] = startNode;
        }

        return topNodes;
    }, [calculateRelevanceScore]);

    // Internal function that actually updates the graph (called after debounce)
    const applyGraphUpdate = useCallback((data: GraphStreamData) => {
        if (!data.nodes || data.nodes.length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }

        if (import.meta.env.DEV) {
            console.debug('[Graph Visualizer] Applying graph update', { 
                nodeCount: data.nodes.length,
                edgeCount: data.edges.length
            });
        }

        // Filter to top 50 most relevant nodes
        const nodesToRender = filterTopNodes(data.nodes, queryContext, MAX_NODES_TO_DISPLAY);

        // Clear any pending layout timeout
        if (layoutTimeoutRef.current) {
            clearTimeout(layoutTimeoutRef.current);
        }

        // Debounce layout calculation
        layoutTimeoutRef.current = setTimeout(() => {
            try {
                // Calculate depth for each node if not provided
                // Build a map of node depths from edges (BFS from start node)
                const nodeDepths = new Map<string, number>();
                const startNode = nodesToRender.find(n => n.depth === 0) || nodesToRender[0];
                if (startNode) {
                    const startDepth = startNode.depth ?? 0;
                    // Use URL as key since edges use URLs
                    nodeDepths.set(startNode.url, startDepth);
                    
                    const queue: Array<{ url: string; depth: number }> = [{ url: startNode.url, depth: startDepth }];
                    const visited = new Set<string>();
                    const nodeUrlSet = new Set(nodesToRender.map(n => n.url));
                    
                    while (queue.length > 0) {
                        const current = queue.shift()!;
                        if (visited.has(current.url)) continue;
                        visited.add(current.url);
                        
                        data.edges
                            .filter(e => e.source === current.url && nodeUrlSet.has(e.target))
                            .forEach(edge => {
                                if (!nodeDepths.has(edge.target)) {
                                    const childDepth = current.depth + 1;
                                    nodeDepths.set(edge.target, childDepth);
                                    queue.push({ url: edge.target, depth: childDepth });
                                }
                            });
                    }
                }
                
                // Group nodes by depth
                const nodesByDepth = new Map<number, typeof nodesToRender>();
                nodesToRender.forEach(node => {
                    // Use URL to look up depth since nodeDepths uses URLs as keys
                    const depth = node.depth ?? nodeDepths.get(node.url) ?? 0;
                    if (!nodesByDepth.has(depth)) {
                        nodesByDepth.set(depth, []);
                    }
                    nodesByDepth.get(depth)!.push(node);
                });
                
                // Sort depths
                const depths = Array.from(nodesByDepth.keys()).sort((a, b) => a - b);
                
                // Manual layout: position nodes by depth
                const horizontalSpacing = 220; // nodeWidth + spacing
                const verticalSpacing = 80; // nodeHeight + spacing
                const startX = 100;
                const startY = 50;
                
                const nodePositions = new Map<string, { x: number; y: number }>();
                
                depths.forEach(depth => {
                    const nodesAtDepth = nodesByDepth.get(depth)!;
                    const y = startY + depth * verticalSpacing;
                    
                    // Center nodes horizontally at each depth
                    const totalWidth = nodesAtDepth.length * horizontalSpacing;
                    const offsetX = startX - (totalWidth / 2) + (horizontalSpacing / 2);
                    
                    nodesAtDepth.forEach((node, index) => {
                        const x = offsetX + index * horizontalSpacing;
                        nodePositions.set(node.id, { x, y });
                    });
                });

                // Convert to ReactFlow format with manual positioning
                const renderedNodeUrls = new Set(nodesToRender.map(n => n.url));
                const flowNodes: Node[] = nodesToRender.map((node) => {
                    const nodeType = node.type === 'document' ? 'document' : node.type === 'section' ? 'section' : 'page';
                    const position = nodePositions.get(node.id) || { x: 0, y: 0 };
                    
                    return {
                        id: node.id,
                        type: 'default',
                        position: { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 },
                        data: {
                            label: (
                                <div className="text-xs">
                                    <div className="font-semibold truncate max-w-[160px]" title={node.title}>
                                        {node.title}
                                    </div>
                                    <div className="text-gray-500 text-[10px] mt-1">
                                        {nodeType}
                                    </div>
                                </div>
                            ),
                            url: node.url,
                            type: nodeType
                        },
                        style: {
                            background: nodeType === 'document' ? '#dbeafe' : nodeType === 'section' ? '#e0e7ff' : '#f3f4f6',
                            border: '1px solid #94a3b8',
                            borderRadius: '8px',
                            width: nodeWidth,
                            height: nodeHeight,
                            fontSize: '12px',
                        }
                    };
                });

                // Filter edges to only include edges between rendered nodes
                const flowEdges: Edge[] = data.edges
                    .filter(edge => 
                        renderedNodeUrls.has(edge.source) && renderedNodeUrls.has(edge.target)
                    )
                    .map((edge, index) => ({
                        id: `e-${edge.source}-${edge.target}-${index}`,
                        source: edge.source,
                        target: edge.target,
                        type: 'default' as const,
                        animated: true,
                        style: { stroke: '#64748b', strokeWidth: 2 },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: '#64748b',
                        },
                    }));

                setNodes(flowNodes);
                setEdges(flowEdges);

                // Auto-fit view after a short delay
                // Clear any existing fitView timeout
                if (fitViewTimeoutRef.current) {
                    clearTimeout(fitViewTimeoutRef.current);
                }
                fitViewTimeoutRef.current = setTimeout(() => {
                    if (isMountedRef.current) {
                        try {
                            // Fit view with minimal padding for compact display
                            fitView({ padding: 0.1, duration: 300, maxZoom: 1.5 });
                        } catch (_err) {
                            // Error fitting view is non-critical, silently ignore
                        }
                    }
                }, 200);
            } catch (_err) {
                logError(_err, 'update-graph-layout');
                setError('Failed to layout graph');
            }
        }, 300);
    }, [fitView, setNodes, setEdges, queryContext, filterTopNodes]);

    // Public update function that debounces and only updates when data actually changes
    const updateGraph = useCallback((data: GraphStreamData) => {
        if (!data.nodes || data.nodes.length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }

        // Create a hash based on actual content, not timestamp
        // Only update if node/edge counts or content actually changed
        const nodeIds = data.nodes.map(n => n.id).sort().join(',');
        const edgeIds = data.edges.map(e => `${e.source}-${e.target}`).sort().join(',');
        const contentHash = `${data.nodes.length}-${data.edges.length}-${nodeIds.substring(0, 200)}-${edgeIds.substring(0, 200)}`;
        
        // Skip if content hasn't changed
        if (lastGraphDataRef.current === contentHash) {
            if (import.meta.env.DEV) {
                console.debug('[Graph Visualizer] Skipping update - no content changes');
            }
            return;
        }

        // Check minimum update interval
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
        
        // If updates are coming too fast, debounce them
        if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL_MS && lastGraphDataRef.current !== null) {
            // Store as pending update
            pendingGraphDataRef.current = data;
            
            // Clear existing debounce
            if (updateDebounceRef.current) {
                clearTimeout(updateDebounceRef.current);
            }
            
            // Set new debounce - will apply the latest pending update
            updateDebounceRef.current = setTimeout(() => {
                if (pendingGraphDataRef.current) {
                    const pendingData = pendingGraphDataRef.current;
                    pendingGraphDataRef.current = null;
                    
                    // Re-check hash in case it changed during debounce
                    const pendingNodeIds = pendingData.nodes.map(n => n.id).sort().join(',');
                    const pendingEdgeIds = pendingData.edges.map(e => `${e.source}-${e.target}`).sort().join(',');
                    const pendingHash = `${pendingData.nodes.length}-${pendingData.edges.length}-${pendingNodeIds.substring(0, 200)}-${pendingEdgeIds.substring(0, 200)}`;
                    
                    if (pendingHash !== lastGraphDataRef.current) {
                        lastGraphDataRef.current = pendingHash;
                        lastUpdateTimeRef.current = Date.now();
                        applyGraphUpdate(pendingData);
                    }
                }
                updateDebounceRef.current = null;
            }, UPDATE_DEBOUNCE_MS);
            
            return;
        }

        // Update immediately if enough time has passed
        lastGraphDataRef.current = contentHash;
        lastUpdateTimeRef.current = now;
        
        // Clear any pending debounced update
        if (updateDebounceRef.current) {
            clearTimeout(updateDebounceRef.current);
            updateDebounceRef.current = null;
        }
        pendingGraphDataRef.current = null;

        applyGraphUpdate(data);
    }, [applyGraphUpdate]);

    // SSE connection for real-time graph updates
    const { isConnected: sseConnected, hasError: sseHasError } = useSSE(
        sseEnabled ? `/api/graph/stream/${encodeURIComponent(runId)}/events` : '',
        {
            enabled: sseEnabled && !!runId && runId.length >= 10,
            onGraphUpdate: useCallback((data) => {
                // Reset error count on successful update
                sseErrorCountRef.current = 0;
                setSseEnabled(true);
                
                // Stop any polling immediately when SSE update arrives
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                
                if (import.meta.env.DEV) {
                    console.debug('[Graph Visualizer] SSE graph_update received', { 
                        nodes: data.nodes.length, 
                        edges: data.edges.length,
                        timestamp: data.timestamp 
                    });
                }
                
                setStats(data.stats);
                updateGraph(data);
                setIsLoading(false);
                setError(null);
            }, [updateGraph]),
            onConnectionError: useCallback(() => {
                sseErrorCountRef.current++;
                if (import.meta.env.DEV) {
                    console.warn(`[Graph Visualizer] SSE connection error (${sseErrorCountRef.current}/${MAX_SSE_ERRORS})`);
                }
                if (sseErrorCountRef.current >= MAX_SSE_ERRORS) {
                    // Fall back to polling after too many SSE errors
                    setSseEnabled(false);
                    console.warn('[Graph Visualizer] SSE connection failed, falling back to polling');
                }
            }, []),
            onOpen: useCallback(() => {
                // When SSE connects, stop any active polling immediately
                if (intervalRef.current) {
                    if (import.meta.env.DEV) {
                        console.debug('[Graph Visualizer] SSE connected, stopping polling');
                    }
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            }, []),
        }
    );

    // Fetch workflow run details to extract query/onderwerp for relevance scoring
    useEffect(() => {
        const fetchRunDetails = async () => {
            if (!runId || runId.trim() === '') return;
            
            try {
                const run = await api.workflow.getRun(runId);
                // Extract onderwerp from run params for semantic scoring
                const onderwerp = run.params?.onderwerp as string | undefined;
                if (onderwerp && typeof onderwerp === 'string' && onderwerp.trim().length > 0) {
                    setQueryContext(onderwerp.trim());
                }
            } catch (err) {
                // Non-critical: if we can't get run details, we'll just use connectivity + recency
                // Don't log as error since this is optional for relevance scoring
                if (import.meta.env.DEV) {
                    console.debug('Could not fetch run details for relevance scoring:', err);
                }
            }
        };

        fetchRunDetails();
    }, [runId]);

    useEffect(() => {
        isMountedRef.current = true;
        let currentInterval = POLL_INTERVAL;
        
        // Start polling for graph updates
        const pollGraph = async () => {
            if (!isMountedRef.current) return;
            
            try {
                const data = await api.graph.getGraphStream(runId);
                
                if (!isMountedRef.current) return;
                
                // Reset 404 counter on success
                consecutive404CountRef.current = 0;
                
                // Reset to normal polling interval on success (if we backed off)
                if (currentInterval !== POLL_INTERVAL) {
                    currentInterval = POLL_INTERVAL;
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                    if (isMountedRef.current) {
                        intervalRef.current = setInterval(pollGraph, currentInterval);
                    }
                }
                
                setStats(data.stats);
                updateGraph(data);
                setIsLoading(false);
                setError(null);
            } catch (err) {
                if (!isMountedRef.current) return;
                
                // Handle specific error cases
                if (err instanceof Error) {
                    // Check if it's a 404 (run not found or graph not initialized)
                    // Check statusCode first (set by BaseApiService), then fall back to message
                    const errorWithStatusCode = err as Error & { statusCode?: number; code?: string };
                    const is404 = 
                        errorWithStatusCode.statusCode === 404 ||
                        errorWithStatusCode.code === 'NOT_FOUND' ||
                        err.message.toLowerCase().includes('not found') ||
                        err.message.includes('404');
                    
                    if (is404) {
                        consecutive404CountRef.current++;
                        
                        // Stop polling if run doesn't exist after multiple attempts
                        if (consecutive404CountRef.current >= MAX_404_ATTEMPTS) {
                            setError('Workflow run not found. The workflow may not have started yet, or the run ID is invalid.');
                            setIsLoading(false);
                            if (intervalRef.current) {
                                clearInterval(intervalRef.current);
                                intervalRef.current = null;
                            }
                            // Don't log 404s as errors - they're expected during workflow startup
                            return;
                        }
                        
                        // Continue polling but don't log as error (expected during startup)
                        setIsLoading(true);
                        return;
                    }
                    
                    // Check if it's a 429 (rate limited)
                    const is429 = 
                        errorWithStatusCode.statusCode === 429 ||
                        errorWithStatusCode.code === 'RATE_LIMIT_EXCEEDED' ||
                        err.message.toLowerCase().includes('too many requests') ||
                        err.message.includes('429');
                    
                    if (is429) {
                        // Rate limited - exponential backoff already applied, no need to log
                        currentInterval = POLL_INTERVAL * 3; // Back off to 15 seconds
                        if (intervalRef.current) {
                            clearInterval(intervalRef.current);
                            intervalRef.current = null;
                        }
                        if (isMountedRef.current) {
                            intervalRef.current = setInterval(pollGraph, currentInterval);
                        }
                        return;
                    }
                }
                
                // Only log non-404 errors
                logError(err, 'poll-graph');
                setError(err instanceof Error ? err.message : 'Failed to load graph');
                setIsLoading(false);
            }
        };

        // Validate runId before starting polling
        if (!runId || runId.trim() === '') {
            setError('No workflow run ID provided');
            setIsLoading(false);
            return;
        }
        
        // Validate runId format (MongoDB ObjectId is 24 hex characters, but also accept other formats)
        // Some runIds might be UUIDs or other formats, so we'll be lenient
        if (runId.length < 10) {
            setError('Invalid workflow run ID format');
            setIsLoading(false);
            return;
        }

        // Clear any existing polling interval first
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        // Only use polling if SSE is explicitly disabled (fallback mode)
        // If SSE is enabled, NEVER poll - SSE handles everything including initial state
        if (!sseEnabled) {
            if (import.meta.env.DEV) {
                console.debug('[Graph Visualizer] SSE disabled, using polling fallback');
            }
            // Polling fallback mode - do initial load and set up interval
            pollGraph();

            // Poll at a slower interval to reduce load
            if (isMountedRef.current) {
                intervalRef.current = setInterval(() => {
                    if (import.meta.env.DEV) {
                        console.debug('[Graph Visualizer] Polling for graph update');
                    }
                    pollGraph();
                }, POLL_INTERVAL);
            }
        } else {
            if (import.meta.env.DEV) {
                console.debug('[Graph Visualizer] SSE enabled, polling disabled - waiting for SSE updates');
            }
            // SSE is enabled - do NOT poll at all
            // SSE endpoint will send initial graph_update on connection
            // Subsequent updates come via graph_update events
        }

        return () => {
            isMountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (layoutTimeoutRef.current) {
                clearTimeout(layoutTimeoutRef.current);
                layoutTimeoutRef.current = null;
            }
            if (fitViewTimeoutRef.current) {
                clearTimeout(fitViewTimeoutRef.current);
                fitViewTimeoutRef.current = null;
            }
            if (updateDebounceRef.current) {
                clearTimeout(updateDebounceRef.current);
                updateDebounceRef.current = null;
            }
        };
    }, [runId, updateGraph, queryContext, sseEnabled, sseConnected]);

    const handleRetry = useCallback(() => {
        consecutive404CountRef.current = 0;
        setError(null);
        setIsLoading(true);
        // Trigger a new poll
        if (runId && runId.length >= 10) {
            api.graph.getGraphStream(runId)
                .then(data => {
                    consecutive404CountRef.current = 0;
                    setStats(data.stats);
                    updateGraph(data);
                    setIsLoading(false);
                    setError(null);
                })
                .catch(err => {
                    // Check if it's a 404 error
                    const errorWithStatusCode = err instanceof Error ? (err as Error & { statusCode?: number; code?: string }) : null;
                    const is404 = errorWithStatusCode && (
                        errorWithStatusCode.statusCode === 404 ||
                        errorWithStatusCode.code === 'NOT_FOUND' ||
                        err instanceof Error && (err.message.toLowerCase().includes('not found') || err.message.includes('404'))
                    );
                    
                    if (is404) {
                        setError('Workflow run not found. The workflow may not have started yet, or the run ID is invalid.');
                    } else {
                        setError(err instanceof Error ? err.message : 'Failed to load graph');
                    }
                    setIsLoading(false);
                });
        } else {
            setError('Invalid workflow run ID format');
            setIsLoading(false);
        }
    }, [runId, updateGraph]);

    if (error) {
        const errorLower = error.toLowerCase();
        const isRunNotFound = 
            errorLower.includes('not found') || 
            errorLower.includes('request validation failed') || 
            errorLower.includes('workflow run not found') ||
            errorLower.includes('run not found');
        const canRetry = consecutive404CountRef.current >= MAX_404_ATTEMPTS && isRunNotFound;
        
        return (
            <div className="h-full flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-md px-4">
                    <p className="text-red-600 mb-2 font-semibold">Error loading graph</p>
                    <p className="text-sm text-gray-600 mb-4">{error}</p>
                    {isRunNotFound && (
                        <div className="mb-4">
                            <p className="text-xs text-gray-500 mb-2">
                                The workflow run may not have started yet, or the run ID may be invalid.
                            </p>
                            <p className="text-xs text-gray-500">
                                {canRetry 
                                    ? 'You can retry once the workflow has started, or close this window.'
                                    : 'Please wait for the workflow to start, or check that the run ID is correct.'}
                            </p>
                        </div>
                    )}
                    <div className="flex gap-2 justify-center">
                        {canRetry && (
                            <button
                                onClick={handleRetry}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Retry
                            </button>
                        )}
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Navigation Graph</h3>
                    {stats && (
                        <p className="text-sm text-gray-600">
                            {stats.totalNodes} nodes • {stats.totalEdges} edges
                        </p>
                    )}
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                    >
                        Close
                    </button>
                )}
            </div>

            {/* Graph */}
            <div className="flex-1 relative">
                {isLoading && nodes.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            <p className="text-gray-600">Loading graph...</p>
                        </div>
                    </div>
                ) : (
                    <ReactFlow {...reactFlowProps}>
                        <Background />
                        <Controls />
                    </ReactFlow>
                )}
            </div>
        </div>
    );
}

export function RealTimeGraphVisualizer({ runId, onClose }: RealTimeGraphVisualizerProps) {
    return (
        <ReactFlowProvider>
            <RealTimeGraphVisualizerInner runId={runId} onClose={onClose} />
        </ReactFlowProvider>
    );
}
