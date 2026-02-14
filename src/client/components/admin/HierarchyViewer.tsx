import { useState } from 'react';
import { api } from '../../services/api';
import { HierarchyTree } from './HierarchyTree';
import { HierarchyValidator } from './HierarchyValidator';
import { isGraphDBHierarchyError, parseError } from '../../utils/errorHandler';

interface HierarchyNode {
    id: string;
    name: string;
    level: 'municipality' | 'province' | 'national' | 'european';
    parentId?: string;
    children?: HierarchyNode[];
    title?: string;
}

export function HierarchyViewer() {
  const [selectedLevel, setSelectedLevel] = useState<'municipality' | 'province' | 'national' | 'european' | ''>('');
  const [, setSelectedJurisdictionId] = useState<string>('');
  const [hierarchyTree, setHierarchyTree] = useState<HierarchyNode | null>(null);
  const [, setRegulations] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDepth, setMaxDepth] = useState(5);

  // Load regulations by level
  const loadByLevel = async (level: 'municipality' | 'province' | 'national' | 'european') => {
    setLoading(true);
    setError(null);
    setSelectedLevel(level);
    setSelectedJurisdictionId('');
    setSelectedNode(null);
    
    try {
      const result = await api.getHierarchyByLevel(level);
      setRegulations(result.regulations);
      
      // Build tree structure from regulations
      if (result.regulations.length > 0) {
        const tree = buildTreeFromRegulations(result.regulations as Array<{ _id?: string; id?: string; hierarchy?: { parentId?: string; level?: string }; [key: string]: unknown }>);
        setHierarchyTree(tree);
      } else {
        setHierarchyTree(null);
      }
    } catch (err) {
      if (isGraphDBHierarchyError(err)) {
        const errorInfo = parseError(err);
        setError(errorInfo.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load hierarchy');
      }
      setHierarchyTree(null);
    } finally {
      setLoading(false);
    }
  };

    // Build tree structure from flat list of regulations
  const buildTreeFromRegulations = (regs: Array<{ _id?: string; id?: string; hierarchy?: { parentId?: string; level?: string }; [key: string]: unknown }>): HierarchyNode | null => {
    if (regs.length === 0) return null;
    
    // Find root nodes (no parent)
    const rootNodes = regs.filter((r) => !r.hierarchy?.parentId);
    
    if (rootNodes.length === 0) {
      // If no root nodes, use first node as root
      const first = regs[0];
      return convertToHierarchyNode(first);
    }
    
    if (rootNodes.length === 1) {
      return buildNodeTree(rootNodes[0], regs);
    }
    
    // Multiple roots - create a virtual root
    return {
      id: 'root',
      name: 'Root',
      level: (selectedLevel || 'municipality') as 'municipality' | 'province' | 'national' | 'european',
      children: rootNodes.map(node => buildNodeTree(node, regs)),
    };
  };

  const buildNodeTree = (node: { _id?: string; id?: string; hierarchy?: { parentId?: string }; [key: string]: unknown }, allNodes: Array<{ _id?: string; id?: string; hierarchy?: { parentId?: string }; [key: string]: unknown }>): HierarchyNode => {
    const nodeId = node._id || node.id || '';
    const children = allNodes.filter((n) => {
      const nId = n._id || n.id || '';
      return n.hierarchy?.parentId === nodeId || nId === node.hierarchy?.parentId;
    });
    
    return {
      ...convertToHierarchyNode(node),
      children: children.length > 0 ? children.map((child) => buildNodeTree(child, allNodes)) : undefined,
    };
  };

  const convertToHierarchyNode = (node: { _id?: string; id?: string; title?: string; name?: string; hierarchy?: { level?: string; parentId?: string }; [key: string]: unknown }): HierarchyNode => {
    const level = (node.hierarchy?.level || (node as { level?: string }).level || 'municipality') as 'municipality' | 'province' | 'national' | 'european';
    return {
      id: node._id || node.id || '',
      name: node.name || node.title || '',
      level,
      parentId: node.hierarchy?.parentId || (node as { parentId?: string }).parentId,
      title: node.title || node.name,
    };
  };

  const handleNodeClick = (node: HierarchyNode) => {
    setSelectedNode(node);
    setSelectedJurisdictionId(node.id);
  };

  // Unused function - keeping for potential future use
  // const _handleUpdateHierarchy = async (newLevel: string, newParentId?: string) => {
  //   if (!selectedNode) return;
  //   
  //   try {
  //     await api.updateHierarchy(selectedNode.id, {
  //       level: newLevel as 'municipality' | 'province' | 'national' | 'european',
  //       parentId: newParentId,
  //     });
  //     
  //     // Reload data
  //     if (selectedLevel) {
  //       await loadByLevel(selectedLevel);
  //     } else if (selectedJurisdictionId) {
  //       await loadSubtree(selectedJurisdictionId);
  //     }
  //   } catch (err) {
  //     alert(`Failed to update hierarchy: ${err instanceof Error ? err.message : 'Unknown error'}`);
  //   }
  // };

  // Filter tree by search term
  const filterTree = (node: HierarchyNode | null, term: string): HierarchyNode | null => {
    if (!node) return null;
    
    const termLower = term.toLowerCase();
    const matches = 
      (node.title?.toLowerCase().includes(termLower)) ||
      (node.name?.toLowerCase().includes(termLower)) ||
      (node.id.toLowerCase().includes(termLower));
    
    const filteredChildren = node.children
      ?.map(child => filterTree(child, term))
      .filter((child): child is HierarchyNode => child !== null);
    
    if (matches || (filteredChildren && filteredChildren.length > 0)) {
      return {
        ...node,
        children: filteredChildren,
      };
    }
    
    return null;
  };

  const displayedTree = searchTerm ? filterTree(hierarchyTree, searchTerm) : hierarchyTree;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              View by Level
            </label>
            <select
              value={selectedLevel}
              onChange={(e) => {
                const level = e.target.value as 'municipality' | 'province' | 'national' | 'european' | '';
                if (level && (level === 'municipality' || level === 'province' || level === 'national' || level === 'european')) {
                  loadByLevel(level);
                } else {
                  setSelectedLevel('');
                  setHierarchyTree(null);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select level...</option>
              <option value="municipality">Gemeente</option>
              <option value="province">Provincie</option>
              <option value="national">Nationaal</option>
              <option value="european">Europees</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search hierarchies..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Depth
            </label>
            <input
              type="number"
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value) || 5)}
              min="1"
              max="10"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => {
                if (selectedLevel) {
                  loadByLevel(selectedLevel);
                }
              }}
              disabled={loading || !selectedLevel}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tree View */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-semibold mb-4">Hierarchy Tree</h3>
          
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {!loading && !displayedTree && (
            <div className="text-center py-8 text-gray-500">
              {selectedLevel ? 'No hierarchies found for this level' : 'Select a level to view hierarchies'}
            </div>
          )}
          
          {!loading && displayedTree && (
            <div className="max-h-[600px] overflow-y-auto">
              <HierarchyTree
                node={displayedTree}
                onNodeSelect={(nodeId) => {
                  const findNode = (n: HierarchyNode): HierarchyNode | null => {
                    if (n.id === nodeId) return n;
                    if (n.children) {
                      for (const child of n.children) {
                        const found = findNode(child);
                        if (found) return found;
                      }
                    }
                    return null;
                  };
                  const node = findNode(displayedTree);
                  if (node) handleNodeClick(node);
                }}
              />
            </div>
          )}
        </div>

        {/* Details Panel */}
        <div className="space-y-4">
          {/* Selected Node Info */}
          {selectedNode && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-lg font-semibold mb-4">Selected Entity</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">ID:</span>
                  <span className="ml-2 font-mono text-xs">{selectedNode.id}</span>
                </div>
                <div>
                  <span className="font-medium">Name:</span>
                  <span className="ml-2">{selectedNode.title || selectedNode.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="font-medium">Level:</span>
                  <span className="ml-2 capitalize">{selectedNode.level}</span>
                </div>
                {selectedNode.parentId && (
                  <div>
                    <span className="font-medium">Parent ID:</span>
                    <span className="ml-2 font-mono text-xs">{selectedNode.parentId}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Validation */}
          {selectedNode && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-lg font-semibold mb-4">Validation</h3>
              <HierarchyValidator validation={{
                success: true,
                entity: {
                  id: selectedNode.id,
                  name: selectedNode.name,
                  hierarchy: {
                    level: selectedNode.level,
                    parentId: selectedNode.parentId,
                  },
                },
                validation: {
                  valid: true,
                  errors: [],
                  warnings: [],
                  info: [],
                },
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
