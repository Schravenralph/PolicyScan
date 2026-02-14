/**
 * Graph Node Details Panel Component
 * 
 * Displays detailed information about a selected cluster node.
 */

import type { ClusterNode } from '../../services/api';
import { t } from '../../utils/i18n';

interface GraphNodeDetailsPanelProps {
    selectedNode: ClusterNode;
    onClose: () => void;
}

export function GraphNodeDetailsPanel({ selectedNode, onClose }: GraphNodeDetailsPanelProps) {
    return (
        <>
            {/* Opaque overlay */}
            <div
                className="fixed inset-0 z-10 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />
            {/* Panel content - inline rendering */}
            <div
                data-testid="details-panel"
                className="relative w-80 bg-background shadow-2xl rounded-lg border-2 border-primary p-4 z-20 overflow-hidden flex flex-col max-h-[calc(100vh-150px)]"
                onClick={(e) => e.stopPropagation()}
            >
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{selectedNode.label}</h3>
                <button
                    data-testid="close-details-btn"
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
                >
                    ✕
                </button>
            </div>
            <div className="space-y-4 overflow-y-auto flex-1">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                        {t('graphPage.contains')} <span className="font-bold">{selectedNode.nodeCount}</span> {t('graphPage.pages')}
                    </p>
                    <div className="text-xs text-blue-600 dark:text-blue-400 break-all mt-1 font-mono">
                        {selectedNode.urlPattern}
                    </div>
                </div>

                <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 uppercase tracking-wider text-xs">{t('graphPage.topPages')}</h4>
                    <ul className="text-sm space-y-2">
                        {selectedNode.children.slice(0, 10).map((url: string, i: number) => (
                            <li key={i} className="flex items-start group">
                                <span className="text-gray-400 mr-2">•</span>
                                <a
                                    href={url.startsWith('http') ? url : `https://${url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate block flex-1"
                                    title={url}
                                >
                                    {url.split('/').filter(Boolean).pop() || url}
                                </a>
                            </li>
                        ))}
                        {selectedNode.children.length > 10 && (
                            <li className="text-xs text-gray-500 italic pt-1">
                                + {selectedNode.children.length - 10} {t('graphPage.morePages')}
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
        </>
    );
}
