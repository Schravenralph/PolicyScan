import { memo } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronRight, ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { HierarchyTreeNode } from './HierarchyTypes';
import type { HierarchyLevel } from '../../shared/types.js';

interface HierarchyNodeProps {
    node: HierarchyTreeNode;
    depth?: number;
    expandedNodes: Set<string>;
    expandedDocuments: Set<string>;
    toggleNode: (nodeId: string) => void;
    toggleDocuments: (nodeId: string) => void;
    onNodeClick?: (node: HierarchyTreeNode) => void;
    onDocumentClick?: (documentId: string, nodeId: string) => void;
    showDocuments?: boolean;
}

const levelLabels: Record<HierarchyLevel, string> = {
    municipality: 'Gemeente',
    province: 'Provincie',
    national: 'Nationaal',
    european: 'Europees',
};

const levelColors: Record<HierarchyLevel, string> = {
    municipality: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    province: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    national: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    european: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

function arePropsEqual(prevProps: HierarchyNodeProps, nextProps: HierarchyNodeProps) {
    // 1. Check if simple props or node object reference changed
    if (prevProps.node !== nextProps.node ||
        prevProps.depth !== nextProps.depth ||
        prevProps.showDocuments !== nextProps.showDocuments ||
        prevProps.toggleNode !== nextProps.toggleNode ||
        prevProps.toggleDocuments !== nextProps.toggleDocuments ||
        prevProps.onNodeClick !== nextProps.onNodeClick ||
        prevProps.onDocumentClick !== nextProps.onDocumentClick) {
        return false;
    }

    const id = nextProps.node.id;

    // 2. Check if expansion state changed for THIS node
    const wasExpanded = prevProps.expandedNodes.has(id);
    const isExpanded = nextProps.expandedNodes.has(id);

    if (wasExpanded !== isExpanded) {
        return false;
    }

    // 3. Check if document expansion state changed for THIS node
    const wasDocExpanded = prevProps.expandedDocuments.has(id);
    const isDocExpanded = nextProps.expandedDocuments.has(id);

    if (wasDocExpanded !== isDocExpanded) {
        return false;
    }

    // 4. Optimization: If the node is collapsed, we don't render children,
    // so we don't need to pass the new expandedNodes Set reference to them.
    // If the node IS expanded, we MUST re-render to pass the potentially new Set reference
    // to the children so they can check their own expansion state.
    if (isExpanded) {
        // If expandedNodes Set reference changed, we must re-render children
        if (prevProps.expandedNodes !== nextProps.expandedNodes) {
            return false;
        }
        // If expandedDocuments Set reference changed, we must re-render children (as they receive it)
        if (prevProps.expandedDocuments !== nextProps.expandedDocuments) {
            return false;
        }
    }

    // If documents are expanded, checking if the Set ref changed is less critical
    // because documents list is flat (not recursive with state dependent on Set)
    // However, if we pass expandedDocuments to children (we do), checking isExpanded handles it.

    return true;
}

export const HierarchyNode = memo(function HierarchyNode({
    node,
    depth = 0,
    expandedNodes,
    expandedDocuments,
    toggleNode,
    toggleDocuments,
    onNodeClick,
    onDocumentClick,
    showDocuments = false,
}: HierarchyNodeProps) {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const documentsExpanded = expandedDocuments.has(node.id);

    // Show documents toggle if explicitly enabled and either:
    // 1. We don't know the count yet (undefined)
    // 2. We know the count is > 0
    // 3. We have documents array with items
    const hasDocuments = showDocuments && (
        (node.documentCount === undefined && node.documents === undefined) ||
        (node.documentCount !== undefined && node.documentCount > 0) ||
        (node.documents !== undefined && node.documents.length > 0)
    );

    return (
        <div className="mb-1">
            <div
                className={`flex items-center gap-2 p-2 rounded hover:bg-accent ${
                    onNodeClick ? 'cursor-pointer' : ''
                } ${depth > 0 ? 'ml-4' : ''}`}
                style={{ paddingLeft: `${depth * 1.5}rem` }}
                onClick={() => onNodeClick?.(node)}
            >
                {hasChildren && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        aria-label={isExpanded ? "Collapse node" : "Expand node"}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleNode(node.id);
                        }}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                    </Button>
                )}
                {!hasChildren && <div className="w-6" />}
                <Badge className={levelColors[node.level]}>
                    {levelLabels[node.level]}
                </Badge>
                <span className="flex-1 text-sm font-medium">{node.name}</span>
                {hasDocuments && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        aria-label={documentsExpanded ? "Hide documents" : "Show documents"}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleDocuments(node.id);
                        }}
                    >
                        {documentsExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                    </Button>
                )}
                {node.url && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(node.url, '_blank');
                        }}
                    >
                        <ExternalLink className="h-4 w-4" />
                    </Button>
                )}
            </div>
            {documentsExpanded && node.documents && (
                <div className="ml-8 mb-2">
                    {node.documents.map((doc) => (
                        <div
                            key={doc.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                            onClick={() => onDocumentClick?.(doc.id, node.id)}
                        >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{doc.name}</span>
                            {doc.url && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 ml-auto"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(doc.url, '_blank');
                                    }}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                    {node.documentCount && node.documentCount > (node.documents?.length || 0) && (
                        <div className="text-xs text-muted-foreground p-2">
                            +{node.documentCount - (node.documents?.length || 0)} more documents
                        </div>
                    )}
                </div>
            )}
            {isExpanded && hasChildren && (
                <div className="ml-4">
                    {node.children!.map((child) => (
                        <HierarchyNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            expandedNodes={expandedNodes}
                            expandedDocuments={expandedDocuments}
                            toggleNode={toggleNode}
                            toggleDocuments={toggleDocuments}
                            onNodeClick={onNodeClick}
                            onDocumentClick={onDocumentClick}
                            showDocuments={showDocuments}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}, arePropsEqual);
