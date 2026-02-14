// Type declarations for @neo4j-nvl packages
// These packages are not installed but are used in Neo4jNVLVisualizer

declare module '@neo4j-nvl/base' {
    export type Layout = 'hierarchical' | 'forceDirected';

    export interface Node {
        id: string;
        caption?: string;
        color?: string;
        size?: number;
        icon?: string;
        properties?: Record<string, unknown>;
        borderColor?: string;
        borderWidth?: number;
        [key: string]: unknown;
    }

    export interface Relationship {
        id: string;
        from: string;
        to: string;
        type?: string;
        caption?: string;
        color?: string;
        width?: number;
        [key: string]: unknown;
    }

    export interface NvlOptions {
        layout?: Layout;
        initialZoom?: number;
        minZoom?: number;
        maxZoom?: number;
        disableTelemetry?: boolean;
        disableWebWorkers?: boolean;
        allowDynamicMinZoom?: boolean;
        renderer?: 'canvas' | 'webgl';
        relationshipThreshold?: number;
        hierarchicalOptions?: {
            direction?: 'up' | 'down' | 'left' | 'right';
            packing?: 'bin' | 'stack';
        };
        forceDirectedOptions?: {
            enableCytoscape?: boolean;
            enableVerlet?: boolean;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    }
}

declare module '@neo4j-nvl/react' {
    import type { Node, Relationship, NvlOptions } from '@neo4j-nvl/base';
    import type { ReactNode } from 'react';

    export interface NvlCallbacks {
        onLayoutDone?: () => void;
        onZoomTransitionDone?: () => void;
        onInitialization?: () => void;
        onLayoutStep?: (nodes: Node[]) => void;
        [key: string]: unknown;
    }

    export interface MouseEventCallbacks {
        onNodeClick?: (node: Node) => void;
        onRelationshipClick?: (rel: Relationship) => void;
        onHover?: (element: Node | Relationship | null) => void;
        [key: string]: unknown;
    }

    export interface InteractiveNvlWrapperProps {
        nodes: Node[];
        rels: Relationship[];
        nvlOptions?: NvlOptions;
        nvlCallbacks?: NvlCallbacks;
        mouseEventCallbacks?: MouseEventCallbacks;
        className?: string;
        [key: string]: unknown;
    }

    export function InteractiveNvlWrapper(props: InteractiveNvlWrapperProps): ReactNode;
}
