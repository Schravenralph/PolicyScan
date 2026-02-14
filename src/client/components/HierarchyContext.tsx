import React, { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronRight, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import type { HierarchyLevel } from '../../shared/types.js';
import { api } from '../services/api';

export interface HierarchyNode {
    id: string;
    name: string;
    level: HierarchyLevel;
    children?: HierarchyNode[];
    url?: string;
    documentCount?: number;
}

interface HierarchyContextProps {
    jurisdictionId: string;
    onNodeClick?: (node: HierarchyNode) => void;
    className?: string;
}

interface SubtreeData {
    entity: {
        id: string;
        name?: string;
        hierarchy?: {
            level: HierarchyLevel;
            parentId?: string;
            childrenIds?: string[];
        };
        url?: string;
        children?: Array<{
            id: string;
            name?: string;
            hierarchy?: {
                level: HierarchyLevel;
                parentId?: string;
                childrenIds?: string[];
            };
            url?: string;
            children?: Array<{
                id: string;
                name?: string;
                hierarchy?: {
                    level: HierarchyLevel;
                    parentId?: string;
                    childrenIds?: string[];
                };
                url?: string;
            }>;
        }>;
    };
    children: Array<{
        id: string;
        name?: string;
        hierarchy?: {
            level: HierarchyLevel;
            parentId?: string;
            childrenIds?: string[];
        };
        url?: string;
        children?: Array<{
            id: string;
            name?: string;
            hierarchy?: {
                level: HierarchyLevel;
                parentId?: string;
                childrenIds?: string[];
            };
            url?: string;
        }>;
    }>;
    parents: Array<{
        id: string;
        name?: string;
        hierarchy?: {
            level: HierarchyLevel;
            parentId?: string;
            childrenIds?: string[];
        };
        url?: string;
    }>;
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

export function HierarchyContext({ jurisdictionId, className }: HierarchyContextProps) {
    const [subtree, setSubtree] = useState<SubtreeData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([jurisdictionId]));

    const loadSubtree = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.hierarchy.getHierarchySubtree(jurisdictionId);
            setSubtree((data.subtree ?? null) as SubtreeData | null);
        } catch (err) {
            // Provide user-friendly error messages
            if (err instanceof Error) {
                if (err.message.includes('KG_HIERARCHICAL_STRUCTURE_ENABLED') || err.message.includes('feature flag')) {
                    setError('Hierarchical structure feature is not enabled. Please enable KG_HIERARCHICAL_STRUCTURE_ENABLED feature flag to use this functionality.');
                } else {
                    setError(err.message);
                }
            } else {
                setError('Failed to load hierarchy');
            }
        } finally {
            setIsLoading(false);
        }
    }, [jurisdictionId]);

    useEffect(() => {
        void loadSubtree();
    }, [loadSubtree]); // loadSubtree already depends on jurisdictionId via useCallback

    const toggleNode = (nodeId: string) => {
        setExpandedNodes((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const renderNode = (node: SubtreeData['entity'] | SubtreeData['children'][0], depth: number = 0): React.ReactNode => {
        const isExpanded = expandedNodes.has(node.id);
        const hasChildren = node.children && node.children.length > 0;

        return (
            <div key={node.id} className="mb-1">
                <div
                    className={`flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer ${
                        depth > 0 ? 'ml-4' : ''
                    }`}
                    style={{ paddingLeft: `${depth * 1.5}rem` }}
                >
                    {hasChildren && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleNode(node.id)}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                    {!hasChildren && <div className="w-6" />}
                    <Badge className={levelColors[node.hierarchy?.level || 'municipality']}>
                        {levelLabels[node.hierarchy?.level || 'municipality']}
                    </Badge>
                    <span className="flex-1 text-sm font-medium">{node.name || node.id}</span>
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
                {isExpanded && hasChildren && node.children && (
                    <div className="ml-4">
                        {node.children.map((child) => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (isLoading) {
        return (
            <Card className={`p-4 ${className || ''}`}>
                <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading hierarchy...</span>
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className={`p-4 ${className || ''}`}>
                <div className="text-sm text-destructive">Error: {error}</div>
            </Card>
        );
    }

    if (!subtree) {
        return (
            <Card className={`p-4 ${className || ''}`}>
                <div className="text-sm text-muted-foreground">No hierarchy data available</div>
            </Card>
        );
    }

    return (
        <Card className={`p-4 ${className || ''}`}>
            <h3 className="text-lg font-semibold mb-4">Hierarchie Context</h3>
            {subtree.parents && subtree.parents.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Ouder Jurisdicties</h4>
                    {subtree.parents.map((parent) => (
                        <div key={parent.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent">
                            <Badge className={levelColors[parent.hierarchy?.level || 'municipality']}>
                                {levelLabels[parent.hierarchy?.level || 'municipality']}
                            </Badge>
                            <span className="text-sm">{parent.name || parent.id}</span>
                        </div>
                    ))}
                </div>
            )}
            {subtree.entity && (
                <div className="mb-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Huidige Jurisdictie</h4>
                    {renderNode(subtree.entity, 0)}
                </div>
            )}
            {subtree.children && subtree.children.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Kind Jurisdicties</h4>
                    {subtree.children.map((child) => renderNode(child, 0))}
                </div>
            )}
        </Card>
    );
}

