import { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Loader2 } from 'lucide-react';
import type { HierarchyLevel } from '../../shared/types.js';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { t } from '../utils/i18n';
import { HierarchyTreeNode } from './HierarchyTypes';
import { HierarchyNode } from './HierarchyNode';

export type { HierarchyTreeNode } from './HierarchyTypes';

interface HierarchyTreeProps {
    rootNodeId?: string;
    onNodeClick?: (node: HierarchyTreeNode) => void;
    onDocumentClick?: (documentId: string, nodeId: string) => void;
    showDocuments?: boolean;
    className?: string;
    maxDepth?: number;
}

export function HierarchyTree({
    rootNodeId,
    onNodeClick,
    onDocumentClick,
    showDocuments = false,
    className,
    maxDepth = 10,
}: HierarchyTreeProps) {
    const [rootNode, setRootNode] = useState<HierarchyTreeNode | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(new Set());

    const loadTree = useCallback(async (nodeId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.hierarchy.getHierarchySubtree(nodeId);

            // Build tree structure
            interface EntityWithHierarchy {
                id: string;
                name?: string;
                hierarchy?: {
                    level?: HierarchyLevel;
                    parentId?: string;
                };
                url?: string;
            }

            interface SubtreeData {
                entity: EntityWithHierarchy;
                children: EntityWithHierarchy[];
            }

            const subtreeData = data.subtree as SubtreeData;
            if (!subtreeData || !subtreeData.entity || !Array.isArray(subtreeData.children)) {
                throw new Error('Invalid subtree data structure');
            }

            // Pre-process children into a map for O(1) lookup
            const childrenMap = new Map<string, EntityWithHierarchy[]>();
            subtreeData.children.forEach((child: EntityWithHierarchy) => {
                const parentId = child.hierarchy?.parentId;
                if (parentId) {
                    if (!childrenMap.has(parentId)) {
                        childrenMap.set(parentId, []);
                    }
                    childrenMap.get(parentId)!.push(child);
                }
            });

            const buildTreeNode = (entity: EntityWithHierarchy, depth: number = 0): HierarchyTreeNode => {
                if (depth > maxDepth) {
                    return {
                        id: entity.id,
                        name: entity.name || entity.id,
                        level: entity.hierarchy?.level || 'municipality',
                        children: [],
                    };
                }

                // O(1) lookup instead of O(N) filter
                const childEntities = childrenMap.get(entity.id) || [];
                const children = childEntities
                    .map((child: EntityWithHierarchy) => buildTreeNode(child, depth + 1));

                return {
                    id: entity.id,
                    name: entity.name || entity.id,
                    level: entity.hierarchy?.level || 'municipality',
                    parentId: entity.hierarchy?.parentId,
                    children: children.length > 0 ? children : undefined,
                    url: entity.url,
                };
            };

            const treeNode = buildTreeNode(subtreeData.entity);
            setRootNode(treeNode);
            setExpandedNodes(new Set([nodeId]));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('hierarchy.failedToLoad'));
        } finally {
            setIsLoading(false);
        }
    }, [maxDepth]);

    useEffect(() => {
        if (rootNodeId) {
            loadTree(rootNodeId);
        }
    }, [rootNodeId, loadTree]);

    const toggleNode = useCallback((nodeId: string) => {
        setExpandedNodes((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    const loadDocuments = useCallback(async (nodeId: string) => {
        try {
            const data = await api.hierarchy.getHierarchyRegulations(nodeId);
            interface DocData {
                id: string;
                name?: string;
                url?: string;
            }
            const regulations = data.regulations as DocData[];
            setRootNode((prev) => {
                if (!prev) return prev;
                const updateNode = (node: HierarchyTreeNode): HierarchyTreeNode => {
                    if (node.id === nodeId) {
                        return {
                            ...node,
                            documents: regulations.slice(0, 10).map((doc) => ({
                                id: doc.id,
                                name: doc.name || doc.id,
                                url: doc.url,
                            })),
                            documentCount: data.count || 0,
                        };
                    }
                    return {
                        ...node,
                        children: node.children?.map(updateNode),
                    };
                };
                return updateNode(prev);
            });
        } catch (err) {
            logError(err, 'load-hierarchy-documents');
        }
    }, []);

    const toggleDocuments = useCallback(async (nodeId: string) => {
        setExpandedDocuments((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
                // Load documents when expanding
                loadDocuments(nodeId);
            }
            return next;
        });
    }, [loadDocuments]);

    if (isLoading) {
        return (
            <Card className={`p-4 ${className || ''}`}>
                <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">{t('hierarchy.loading')}</span>
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className={`p-4 ${className || ''}`}>
                <div className="text-sm text-destructive">{t('hierarchy.error').replace('{{error}}', error)}</div>
            </Card>
        );
    }

    if (!rootNode) {
        return (
            <Card className={`p-4 ${className || ''}`}>
                <div className="text-sm text-muted-foreground">{t('hierarchy.noData')}</div>
            </Card>
        );
    }

    return (
        <Card className={`p-4 ${className || ''}`}>
            <div className="space-y-1">
                <HierarchyNode
                    node={rootNode}
                    expandedNodes={expandedNodes}
                    expandedDocuments={expandedDocuments}
                    toggleNode={toggleNode}
                    toggleDocuments={toggleDocuments}
                    onNodeClick={onNodeClick}
                    onDocumentClick={onDocumentClick}
                    showDocuments={showDocuments}
                />
            </div>
        </Card>
    );
}
