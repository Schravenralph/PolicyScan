import { useState, useEffect } from 'react';
import { Layers, Plus, ChevronDown, Check, Archive, Trash2 } from 'lucide-react';
import { api, Subgraph } from '../services/api';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';
import { logError } from '../utils/errorHandler';

interface SubgraphSelectorProps {
    onSelect: (subgraph: Subgraph | null) => void;
    selectedId?: string;
}

export function SubgraphSelector({ onSelect, selectedId }: SubgraphSelectorProps) {
    const [subgraphs, setSubgraphs] = useState<Subgraph[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newSubgraphName, setNewSubgraphName] = useState('');
    const [newSubgraphDescription, setNewSubgraphDescription] = useState('');
    const [createOptions, setCreateOptions] = useState({
        startNode: '',
        maxDepth: 3,
        maxNodes: 500,
        urlPattern: ''
    });

    useEffect(() => {
        loadSubgraphs();
    }, []);

    const loadSubgraphs = async () => {
        setIsLoading(true);
        try {
            const result = await api.getSubgraphs({ limit: 50 });
            // Ensure subgraphs is always an array, even if result or result.subgraphs is undefined
            setSubgraphs(Array.isArray(result?.subgraphs) ? result.subgraphs : []);
        } catch (error) {
            logError(error, 'load-subgraphs');
            setSubgraphs([]); // Ensure subgraphs is always an array
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = (subgraph: Subgraph | null) => {
        onSelect(subgraph);
        setIsOpen(false);
    };

    const handleCreateSubgraph = async () => {
        if (!newSubgraphName.trim()) return;

        try {
            const result = await api.createSubgraphFromGraph({
                name: newSubgraphName.trim(),
                description: newSubgraphDescription.trim() || undefined,
                startNode: createOptions.startNode || undefined,
                maxDepth: createOptions.maxDepth,
                maxNodes: createOptions.maxNodes,
                urlPattern: createOptions.urlPattern || undefined
            });

            // Ensure prev is always an array and result.subgraph exists
            setSubgraphs(prev => {
                const prevArray = Array.isArray(prev) ? prev : [];
                return result?.subgraph ? [result.subgraph, ...prevArray] : prevArray;
            });
            if (result?.subgraph) {
                onSelect(result.subgraph);
            }
            setShowCreateModal(false);
            setNewSubgraphName('');
            setNewSubgraphDescription('');
        } catch (error) {
            logError(error, 'create-subgraph');
            toast.error('Subgraph aanmaken mislukt', 'Probeer het opnieuw.');
        }
    };

    const handleArchive = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.archiveSubgraph(id);
            setSubgraphs(prev => {
                const prevArray = Array.isArray(prev) ? prev : [];
                return prevArray.map(s => s.id === id ? { ...s, status: 'archived' } : s);
            });
        } catch (error) {
            logError(error, 'archive-subgraph');
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(t('subgraphSelector.deleteConfirm'))) return;
        
        try {
            await api.deleteSubgraph(id);
            setSubgraphs(prev => {
                const prevArray = Array.isArray(prev) ? prev : [];
                return prevArray.filter(s => s.id !== id);
            });
            if (selectedId === id) {
                onSelect(null);
            }
        } catch (error) {
            logError(error, 'delete-subgraph');
        }
    };

    // Ensure subgraphs is always an array before calling .find()
    const subgraphsArray = Array.isArray(subgraphs) ? subgraphs : [];
    const selectedSubgraph = subgraphsArray.find(s => s.id === selectedId) || null;

    return (
        <div className="relative">
            {/* Selector Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
                <Layers className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedSubgraph ? selectedSubgraph.name : t('subgraphSelector.fullGraph')}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            {t('subgraphSelector.createNewSubgraph')}
                        </button>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                        {/* Full Graph option */}
                        <button
                            onClick={() => handleSelect(null)}
                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                !selectedId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            }`}
                        >
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                                <Layers className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 text-left">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{t('subgraphSelector.fullGraph')}</div>
                                <div className="text-xs text-gray-500">{t('subgraphSelector.completeNavigationGraph')}</div>
                            </div>
                            {!selectedId && <Check className="w-4 h-4 text-blue-600" />}
                        </button>

                        {/* Subgraph options */}
                        {isLoading ? (
                            <div className="px-4 py-3 text-sm text-gray-500">{t('subgraphSelector.loading')}</div>
                        ) : !subgraphsArray || subgraphsArray.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">{t('subgraphSelector.noSubgraphs')}</div>
                        ) : (
                            subgraphsArray.map(subgraph => (
                                <button
                                    key={subgraph.id}
                                    onClick={() => handleSelect(subgraph)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group ${
                                        selectedId === subgraph.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                    } ${subgraph.status === 'archived' ? 'opacity-50' : ''}`}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                        subgraph.status === 'active' 
                                            ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                                            : subgraph.status === 'archived'
                                            ? 'bg-gray-300 dark:bg-gray-600'
                                            : 'bg-gradient-to-br from-gray-400 to-gray-500'
                                    }`}>
                                        <Layers className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {subgraph.name}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {subgraph.metadata?.totalNodes ?? 0} {t('graphPage.nodes')} • {subgraph.metadata?.approvedCount ?? 0} {t('graphPage.approved')}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {subgraph.status !== 'archived' && (
                                            <button
                                                onClick={(e) => handleArchive(subgraph.id, e)}
                                                className="p-1 text-gray-400 hover:text-gray-600"
                                                title={t('subgraphSelector.archive')}
                                            >
                                                <Archive className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => handleDelete(subgraph.id, e)}
                                            className="p-1 text-gray-400 hover:text-red-600"
                                            title={t('subgraphSelector.delete')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {selectedId === subgraph.id && <Check className="w-4 h-4 text-blue-600" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            {t('subgraphSelector.createNewSubgraph')}
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('subgraphSelector.name')}
                                </label>
                                <input
                                    type="text"
                                    value={newSubgraphName}
                                    onChange={(e) => setNewSubgraphName(e.target.value)}
                                    placeholder={t('subgraphSelector.namePlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('subgraphSelector.description')}
                                </label>
                                <textarea
                                    value={newSubgraphDescription}
                                    onChange={(e) => setNewSubgraphDescription(e.target.value)}
                                    placeholder={t('subgraphSelector.descriptionPlaceholder')}
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('subgraphSelector.startNodeUrl')}
                                </label>
                                <input
                                    type="text"
                                    value={createOptions.startNode}
                                    onChange={(e) => setCreateOptions({ ...createOptions, startNode: e.target.value })}
                                    placeholder={t('subgraphSelector.startNodePlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {t('subgraphSelector.urlPattern')}
                                </label>
                                <input
                                    type="text"
                                    value={createOptions.urlPattern}
                                    onChange={(e) => setCreateOptions({ ...createOptions, urlPattern: e.target.value })}
                                    placeholder={t('subgraphSelector.urlPatternPlaceholder')}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {t('subgraphSelector.maxDepth')}
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={createOptions.maxDepth}
                                        onChange={(e) => setCreateOptions({ ...createOptions, maxDepth: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {t('subgraphSelector.maxNodes')}
                                    </label>
                                    <input
                                        type="number"
                                        min={10}
                                        max={5000}
                                        value={createOptions.maxNodes}
                                        onChange={(e) => setCreateOptions({ ...createOptions, maxNodes: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleCreateSubgraph}
                                disabled={!newSubgraphName.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('subgraphSelector.createSubgraph')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


