import { useState } from 'react';
import { ChevronRight, ChevronDown, Building2, MapPin, Globe, Flag } from 'lucide-react';

interface HierarchyNode {
    id: string;
    name: string;
    level: 'municipality' | 'province' | 'national' | 'european';
    parentId?: string;
    children?: HierarchyNode[];
    regulations?: Array<{
        id: string;
        title: string;
        type: string;
    }>;
}

interface HierarchyTreeProps {
    node: HierarchyNode;
    searchTerm?: string;
    onNodeSelect?: (nodeId: string) => void;
    depth?: number;
    expanded?: boolean;
}

const levelIcons = {
    municipality: Building2,
    province: MapPin,
    national: Flag,
    european: Globe,
};

const levelColors = {
    municipality: 'text-blue-600',
    province: 'text-green-600',
    national: 'text-purple-600',
    european: 'text-orange-600',
};

export function HierarchyTree({
    node,
    searchTerm = '',
    onNodeSelect,
    depth = 0,
    expanded: initiallyExpanded = true,
}: HierarchyTreeProps) {
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const hasChildren = node.children && node.children.length > 0;
    const Icon = levelIcons[node.level] || Building2;
    const colorClass = levelColors[node.level] || 'text-gray-600';

    // Filter children based on search term
    const filteredChildren = searchTerm
        ? node.children?.filter(
              (child) =>
                  child.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  child.id.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : node.children;

    const matchesSearch =
        !searchTerm ||
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.id.toLowerCase().includes(searchTerm.toLowerCase());

    // Don't render if doesn't match search and has no matching children
    if (!matchesSearch && (!filteredChildren || filteredChildren.length === 0)) {
        return null;
    }

    return (
        <div className="select-none">
            <div
                className={`flex items-center gap-2 py-2 px-3 rounded hover:bg-gray-50 cursor-pointer ${
                    matchesSearch ? 'bg-blue-50' : ''
                }`}
                style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
                onClick={() => {
                    if (hasChildren) {
                        setExpanded(!expanded);
                    }
                    if (onNodeSelect) {
                        onNodeSelect(node.id);
                    }
                }}
            >
                {hasChildren ? (
                    expanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                    )
                ) : (
                    <div className="w-4" />
                )}

                <Icon className={`w-4 h-4 ${colorClass}`} />
                <span className="font-medium text-gray-900">{node.name}</span>
                <span className="text-xs text-gray-500">({node.id})</span>
                <span
                    className={`ml-auto text-xs px-2 py-1 rounded ${
                        node.level === 'municipality'
                            ? 'bg-blue-100 text-blue-700'
                            : node.level === 'province'
                            ? 'bg-green-100 text-green-700'
                            : node.level === 'national'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-orange-100 text-orange-700'
                    }`}
                >
                    {node.level}
                </span>
                {node.regulations && node.regulations.length > 0 && (
                    <span className="text-xs text-gray-500">
                        {node.regulations.length} regulation{node.regulations.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {expanded && filteredChildren && filteredChildren.length > 0 && (
                <div className="border-l border-gray-200 ml-2">
                    {filteredChildren.map((child) => (
                        <HierarchyTree
                            key={child.id}
                            node={child}
                            searchTerm={searchTerm}
                            onNodeSelect={onNodeSelect}
                            depth={depth + 1}
                            expanded={initiallyExpanded}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
