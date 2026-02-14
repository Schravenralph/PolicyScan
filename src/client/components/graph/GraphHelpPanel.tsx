/**
 * Graph Help Panel Component
 * 
 * Displays help information about how to populate the navigation graph.
 */

import { t } from '../../utils/i18n';

interface GraphHelpPanelProps {
    onClose: () => void;
}

export function GraphHelpPanel({ onClose }: GraphHelpPanelProps) {
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
                className="relative w-96 bg-background shadow-2xl rounded-lg border-2 border-primary p-4 z-20 overflow-hidden flex flex-col max-h-[calc(100vh-150px)]"
                onClick={(e) => e.stopPropagation()}
            >
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                    {t('graphHelp.title')}
                </h3>
                <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
                    aria-label={t('graphHelp.closeHelp')}
                >
                    ✕
                </button>
            </div>
            <div className="space-y-4 overflow-y-auto flex-1">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                    <p className="text-sm text-blue-800 dark:text-blue-300 font-semibold mb-2">
                        {t('graphHelp.description')}
                    </p>
                </div>

                <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 uppercase tracking-wider text-xs">
                        {t('graphHelp.workflowActionsTitle')}
                    </h4>
                    <ul className="text-sm space-y-2 text-gray-700 dark:text-gray-300">
                        <li className="flex items-start">
                            <span className="text-gray-400 mr-2">•</span>
                            <div>
                                <span className="font-medium">search_iplo_documents</span>
                                <span className="text-gray-500 dark:text-gray-400">{t('graphHelp.action.iplo')}</span>
                            </div>
                        </li>
                        <li className="flex items-start">
                            <span className="text-gray-400 mr-2">•</span>
                            <div>
                                <span className="font-medium">search_officielebekendmakingen</span>
                                <span className="text-gray-500 dark:text-gray-400">{t('graphHelp.action.officielebekendmakingen')}</span>
                            </div>
                        </li>
                        <li className="flex items-start">
                            <span className="text-gray-400 mr-2">•</span>
                            <div>
                                <span className="font-medium">explore_discovered_websites</span>
                                <span className="text-gray-500 dark:text-gray-400">{t('graphHelp.action.exploreWebsites')}</span>
                            </div>
                        </li>
                        <li className="flex items-start">
                            <span className="text-gray-400 mr-2">•</span>
                            <div>
                                <span className="font-medium">bfs_explore_3_hops</span>
                                <span className="text-gray-500 dark:text-gray-400">{t('graphHelp.action.bfsExplore')}</span>
                            </div>
                        </li>
                        <li className="flex items-start">
                            <span className="text-gray-400 mr-2">•</span>
                            <div>
                                <span className="font-medium">google_search_topic</span>
                                <span className="text-gray-500 dark:text-gray-400">{t('graphHelp.action.googleSearch')}</span>
                            </div>
                        </li>
                    </ul>
                </div>

                <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 uppercase tracking-wider text-xs">
                        {t('graphHelp.quickStartTitle')}
                    </h4>
                    <ol className="text-sm space-y-2 text-gray-700 dark:text-gray-300 list-decimal list-inside">
                        <li dangerouslySetInnerHTML={{ __html: t('graphHelp.step1') }} />
                        <li>{t('graphHelp.step2')}</li>
                        <li>{t('graphHelp.step3')}</li>
                    </ol>
                </div>

                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <a
                        href="/beleidsscan"
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                    >
                        {t('graphHelp.runWorkflow')}
                    </a>
                </div>
            </div>
        </div>
        </>
    );
}
