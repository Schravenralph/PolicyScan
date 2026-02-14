export type LayoutAlgorithm = 'dagre' | 'circular' | 'force';

interface LayoutSelectorProps {
    currentLayout: LayoutAlgorithm;
    onLayoutChange: (layout: LayoutAlgorithm) => void;
}

export function LayoutSelector({ currentLayout, onLayoutChange }: LayoutSelectorProps) {
    return (
        <div className="absolute top-4 right-4 z-10 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
                Layout
            </label>
            <div className="flex space-x-1">
                <button
                    onClick={() => onLayoutChange('dagre')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentLayout === 'dagre'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                >
                    Hierarchical
                </button>
                <button
                    onClick={() => onLayoutChange('circular')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentLayout === 'circular'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                >
                    Circular
                </button>
                <button
                    onClick={() => onLayoutChange('force')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentLayout === 'force'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                >
                    Organic
                </button>
            </div>
        </div>
    );
}
