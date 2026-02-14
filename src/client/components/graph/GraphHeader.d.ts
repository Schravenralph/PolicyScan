/**
 * Graph Header Component
 *
 * Displays the graph page header with title, statistics, and subgraph selector.
 */
import type { Subgraph, MetaGraphResponse } from '../../services/api';
import type { NavigationGraphResponse } from '../../services/api';
import type { GraphHealthResponse } from '../../services/api';
interface GraphHeaderProps {
    selectedSubgraph: Subgraph | null;
    visualizationMode: 'meta' | 'connected' | 'all' | 'clustered';
    graphData: MetaGraphResponse | null;
    navigationGraphData: NavigationGraphResponse | null;
    graphHealth: GraphHealthResponse | null;
    onSubgraphSelect: (subgraph: Subgraph | null) => void;
}
export declare function GraphHeader({ selectedSubgraph, visualizationMode, graphData, navigationGraphData, graphHealth, onSubgraphSelect, }: GraphHeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
