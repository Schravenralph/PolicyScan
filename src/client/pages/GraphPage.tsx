import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Node,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { LayoutAlgorithm } from '../components/LayoutSelector';
import { Subgraph, api, MetaGraphResponse, ClusterNode } from '../services/api';
import type { NavigationGraphResponse } from '../services/api';
import type { GraphHealthResponse } from '../services/api';
import { t } from '../utils/i18n';
import { logError, parseError } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../utils/apiUrl';
import { createNode, renderMetaGraph, renderNavigationGraph } from '../utils/graphRenderingUtils';
import { GraphVisualization } from '../components/graph/GraphVisualization';
import { GraphControls } from '../components/graph/GraphControls';
import { GraphHealthBanner } from '../components/graph/GraphHealthBanner';
import { GraphHelpPanel } from '../components/graph/GraphHelpPanel';
import { GraphNodeDetailsPanel } from '../components/graph/GraphNodeDetailsPanel';
import { GraphHeader } from '../components/graph/GraphHeader';

type VisualizationMode = 'meta' | 'connected' | 'all' | 'clustered';

function GraphPageInner() {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(true);
    const { fitView } = useReactFlow();

    // Layout state
    const [currentLayout, setCurrentLayout] = useState<LayoutAlgorithm>('dagre');
    const [graphData, setGraphData] = useState<MetaGraphResponse | null>(null);
    const [navigationGraphData, setNavigationGraphData] = useState<NavigationGraphResponse | null>(null);

    const [selectedNode, setSelectedNode] = useState<ClusterNode | null>(null);
    
    // Subgraph selection state
    const [selectedSubgraph, setSelectedSubgraph] = useState<Subgraph | null>(null);

    // Graph health state
    const [graphHealth, setGraphHealth] = useState<GraphHealthResponse | null>(null);
    const [healthDismissed, setHealthDismissed] = useState(false);
    
    // Help panel state
    const [showHelpPanel, setShowHelpPanel] = useState(false);
    
    // Graph population indicators state
    const [previousNodeCount, setPreviousNodeCount] = useState<number>(0);
    const [milestonesReached, setMilestonesReached] = useState<Set<number>>(new Set());
    const [realTimeNodeCount, setRealTimeNodeCount] = useState<number | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Visualization mode state with localStorage persistence
    const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>(() => {
        const saved = localStorage.getItem('graphVisualizationMode');
        return (saved as VisualizationMode) || 'meta';
    });

    // Save mode to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('graphVisualizationMode', visualizationMode);
    }, [visualizationMode]);

    // createNode is now imported from graphRenderingUtils
    const createNodeCallback = useCallback((id: string, cluster: ClusterNode, x: number, y: number): Node => {
        return createNode(id, cluster, x, y);
    }, []);

    const renderMetaGraphCallback = useCallback((data: MetaGraphResponse, layout: LayoutAlgorithm) => {
        renderMetaGraph(
            data,
            layout,
            setNodes,
            setEdges,
            setIsLoading,
            fitView,
            createNodeCallback
        );
    }, [fitView, setNodes, setEdges, createNodeCallback]);

    const loadMetaGraph = useCallback(async () => {
        setIsLoading(true);
        try {
            // Use optimal parameters we found
            let data = await api.graph.getMetaGraph({
                pathDepth: 2,
                minClusterSize: 20,
            });
            
            // If no clusters found but nodes exist, retry with lower minClusterSize
            if (data && typeof data === 'object' && data.clusters) {
                const clusterKeys = Object.keys(data.clusters);
                if (data.totalNodes > 0 && clusterKeys.length === 0) {
                    // Retry with minClusterSize: 1 to show all nodes
                    console.log('No clusters found with minClusterSize: 20, retrying with minClusterSize: 1');
                    data = await api.graph.getMetaGraph({
                        pathDepth: 2,
                        minClusterSize: 1,
                    });
                }
            }
            
            // Ensure data has the expected structure
            if (data && typeof data === 'object' && data.clusters) {
                setGraphData(data);
            } else {
                logError(new Error('Invalid graph data format'), 'load-graph');
                setGraphData(null);
                setIsLoading(false);
            }
        } catch (_error) {
            logError(_error, 'load-graph');
            const errorInfo = parseError(_error);
            toast.error(errorInfo.title || t('graphPage.loadError'), errorInfo.message || t('graphPage.loadErrorDescription'));
            setGraphData(null);
            setIsLoading(false);
        }
    }, []);

    const loadNavigationGraph = useCallback(async (mode: 'connected' | 'all' | 'clustered') => {
        setIsLoading(true);
        try {
            const data = await api.graph.getGraph({
                mode,
                maxNodes: 500,
                maxDepth: 3,
            });
            
            if (data && typeof data === 'object' && data.nodes) {
                setNavigationGraphData(data);
            } else {
                logError(new Error('Invalid navigation graph data format'), 'load-navigation-graph');
                setNavigationGraphData(null);
                setIsLoading(false);
            }
        } catch (_error) {
            logError(_error, 'load-navigation-graph');
            const errorInfo = parseError(_error);
            toast.error(errorInfo.title || t('graphPage.loadNavigationError'), errorInfo.message || t('graphPage.loadNavigationErrorDescription'));
            setNavigationGraphData(null);
            setIsLoading(false);
        }
    }, []);

    // Load graph health check and refresh when graph data changes
    const fetchHealth = useCallback(async () => {
        try {
            const health = await api.graph.getHealth();
            const currentNodeCount = health.totalNodes;
            
            // Check for milestones (10, 50, 100, 500, 1000)
            const milestones = [10, 50, 100, 500, 1000];
            const newMilestone = milestones.find(
                milestone => 
                    currentNodeCount >= milestone && 
                    previousNodeCount < milestone &&
                    !milestonesReached.has(milestone)
            );
            
            if (newMilestone) {
                // Show milestone notification
                setMilestonesReached(prev => new Set([...prev, newMilestone]));
                toast.success(t('graphPage.milestoneTitle'), t('graphPage.milestoneMessage').replace('{{count}}', String(newMilestone)));
            }
            
            setGraphHealth(health);
            setPreviousNodeCount(currentNodeCount);
            
            // Reset dismissed state if graph becomes populated
            if (health.totalNodes > 0) {
                setHealthDismissed(false);
            }
        } catch (error) {
            logError(error, 'fetch-graph-health');
            // Don't show toast for health check errors - they're non-critical background updates
        }
    }, [previousNodeCount, milestonesReached]);

    useEffect(() => {
        fetchHealth();
    }, [fetchHealth]);

    // Refresh health check when graph data loads
    useEffect(() => {
        if (!isLoading && (graphData || navigationGraphData)) {
            // Small delay to ensure backend has processed any updates
            const timeoutId = setTimeout(() => {
                fetchHealth();
            }, 500);
            return () => clearTimeout(timeoutId);
        }
    }, [isLoading, graphData, navigationGraphData, fetchHealth]);

    // Poll graph health periodically to show real-time population updates
    useEffect(() => {
        // Poll every 3 seconds when page is active
        const pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && !isLoading) {
                fetchHealth();
            }
        }, 3000);

        return () => clearInterval(pollInterval);
    }, [fetchHealth, isLoading]);

    // Set up Socket.IO listener for real-time node count updates
    useEffect(() => {
        const apiBaseUrl = getApiBaseUrl();
        let socketUrl: string | undefined;
        
        if (apiBaseUrl.startsWith('/')) {
            socketUrl = undefined; // Use current origin
        } else {
            try {
                const apiUrlObj = new URL(apiBaseUrl);
                const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
                socketUrl = apiUrlObj.origin === currentOrigin ? undefined : apiBaseUrl;
            } catch {
                socketUrl = apiBaseUrl;
            }
        }
        
        const socket = io(socketUrl, {
            path: '/api/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000, // Start with 1 second delay
            reconnectionDelayMax: 10000, // Max 10 seconds between attempts (increased from 5s)
            reconnectionAttempts: Infinity, // Retry indefinitely (was 5, too low for intermittent issues)
            // Exponential backoff: delay increases with each attempt up to reconnectionDelayMax
            randomizationFactor: 0.5, // Add randomness to prevent thundering herd
            timeout: 60000, // 60 seconds - increased to match server pingTimeout and handle network latency (was: 20s default)
            withCredentials: true,
            autoConnect: true,
        });
        
        socketRef.current = socket;
        
        socket.on('connect', () => {
            console.log('[GraphPage] Connected to Socket.IO for real-time updates');
        });
        
        socket.on('graph:node-count', (data: { totalNodes: number; totalEdges: number; timestamp: string }) => {
            if (data && typeof data.totalNodes === 'number') {
                setRealTimeNodeCount(data.totalNodes);
                
                // Update health if we have real-time data
                setGraphHealth(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        totalNodes: data.totalNodes,
                        totalEdges: data.totalEdges
                    };
                });
                
                // Check for milestones
                const milestones = [10, 50, 100, 500, 1000];
                const newMilestone = milestones.find(
                    milestone => 
                        data.totalNodes >= milestone && 
                        previousNodeCount < milestone &&
                        !milestonesReached.has(milestone)
                );
                
                if (newMilestone) {
                    setMilestonesReached(prev => new Set([...prev, newMilestone]));
                    toast.success(t('graphPage.milestoneTitle'), t('graphPage.milestoneMessage').replace('{{count}}', newMilestone.toLocaleString()));
                    setPreviousNodeCount(data.totalNodes);
                }
            }
        });
        
        socket.on('disconnect', () => {
            console.log('[GraphPage] Disconnected from Socket.IO');
        });
        
        socket.on('connect_error', (error) => {
            // Check if it's a timeout error
            const errorWithType = error as Error & { type?: string; message?: string };
            const isTimeout = errorWithType.message === 'timeout' || errorWithType.type === 'timeout' || errorWithType.message?.toLowerCase().includes('timeout');
            
            if (isTimeout) {
                // Timeout errors are expected during connection attempts
                // Socket.IO will automatically retry, so don't log as error
                console.warn('[GraphPage] ⚠️ Socket.IO connection timeout - retrying automatically');
                return;
            }
            
            // Log other connection errors
            console.warn('[GraphPage] Socket.IO connection error:', error);
        });
        
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [previousNodeCount, milestonesReached]);

    // Load graph data based on visualization mode
    useEffect(() => {
        if (visualizationMode === 'meta') {
            loadMetaGraph();
        } else {
            loadNavigationGraph(visualizationMode);
        }
    }, [selectedSubgraph, visualizationMode, loadMetaGraph, loadNavigationGraph]);

    // Render navigation graph data - now using utility function
    const renderNavigationGraphCallback = useCallback((data: NavigationGraphResponse, layout: LayoutAlgorithm) => {
        renderNavigationGraph(
            data,
            layout,
            setNodes,
            setEdges,
            setIsLoading,
            fitView
        );
    }, [fitView, setNodes, setEdges]);

    // Re-run layout when algorithm or data changes
    useEffect(() => {
        if (visualizationMode === 'meta' && graphData) {
            renderMetaGraphCallback(graphData, currentLayout);
        } else if (visualizationMode !== 'meta' && navigationGraphData) {
            renderNavigationGraphCallback(navigationGraphData, currentLayout);
        }
    }, [currentLayout, graphData, navigationGraphData, visualizationMode, renderMetaGraphCallback, renderNavigationGraphCallback]);

    const onNodeClick = (_event: React.MouseEvent, node: Node) => {
        const clusterId = (node.data as { clusterId?: string }).clusterId;
        if (clusterId && graphData?.clusters[clusterId]) {
            setSelectedNode(graphData.clusters[clusterId]);
        }
    };

    const onPaneClick = () => {
        setSelectedNode(null);
    };


    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <div className="space-y-2">
                        <p className="text-gray-900 dark:text-gray-100 font-medium">{t('graphPage.loading')}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{t('graphPage.loadingSubtitle')}</p>
                    </div>
                </div>
            </div>
        );
    }

    const handleModeChange = (mode: string) => {
        setVisualizationMode(mode as VisualizationMode);
        setSelectedNode(null); // Clear selected node when switching modes
    };

    // Show health banner if graph is empty or has critical/warning status
    const showHealthBanner = graphHealth && (
        (graphHealth.totalNodes === 0 && !healthDismissed) ||
        (graphHealth.status === 'critical' && !healthDismissed) ||
        (graphHealth.status === 'warning' && !healthDismissed)
    );

    return (
        <div className="h-full flex flex-col relative">
            {showHealthBanner && graphHealth && (
                <GraphHealthBanner
                    graphHealth={graphHealth}
                    onDismiss={() => setHealthDismissed(true)}
                />
            )}
            <GraphControls
                currentLayout={currentLayout}
                onLayoutChange={setCurrentLayout}
                visualizationMode={visualizationMode}
                onModeChange={handleModeChange}
                graphHealth={graphHealth}
                previousNodeCount={previousNodeCount}
                realTimeNodeCount={realTimeNodeCount}
                showHelpPanel={showHelpPanel}
                onToggleHelpPanel={() => setShowHelpPanel(!showHelpPanel)}
            />

            <GraphHeader
                selectedSubgraph={selectedSubgraph}
                visualizationMode={visualizationMode}
                graphData={graphData}
                navigationGraphData={navigationGraphData}
                graphHealth={graphHealth}
                onSubgraphSelect={setSelectedSubgraph}
            />

            {/* Panels - inline rendering */}
            {(showHelpPanel || selectedNode) && (
                <div className="flex gap-4 p-4 flex-shrink-0">
                    {showHelpPanel && (
                        <GraphHelpPanel onClose={() => setShowHelpPanel(false)} />
                    )}
                    {selectedNode && (
                        <GraphNodeDetailsPanel
                            selectedNode={selectedNode}
                            onClose={() => setSelectedNode(null)}
                        />
                    )}
                </div>
            )}

            <GraphVisualization
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                graphData={graphData}
            />
        </div>
    );
}

// Wrapper component with ReactFlowProvider
export function GraphPage() {
    return (
        <ReactFlowProvider>
            <GraphPageInner />
        </ReactFlowProvider>
    );
}
