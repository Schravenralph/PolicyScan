/**
 * Graph Health Banner Component
 * 
 * Displays health status banner for the navigation graph,
 * including warnings, recommendations, and action buttons.
 */

import type { GraphHealthResponse } from '../../services/api';
import { t } from '../../utils/i18n';

interface GraphHealthBannerProps {
    graphHealth: GraphHealthResponse;
    onDismiss: () => void;
}

export function GraphHealthBanner({ graphHealth, onDismiss }: GraphHealthBannerProps) {
    const getBannerStyles = () => {
        if (graphHealth.totalNodes === 0) {
            return {
                bg: 'bg-yellow-50 dark:bg-yellow-900/20',
                border: 'border-yellow-200 dark:border-yellow-800',
                title: 'text-yellow-800 dark:text-yellow-200',
                text: 'text-yellow-700 dark:text-yellow-300',
                list: 'text-yellow-600 dark:text-yellow-400',
                button: 'text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-800/50 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800',
                buttonText: 'text-yellow-700 dark:text-yellow-300'
            };
        }
        if (graphHealth.status === 'critical') {
            return {
                bg: 'bg-red-50 dark:bg-red-900/20',
                border: 'border-red-200 dark:border-red-800',
                title: 'text-red-800 dark:text-red-200',
                text: 'text-red-700 dark:text-red-300',
                list: 'text-red-600 dark:text-red-400',
                button: 'text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-800/50 border-red-300 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-800',
                buttonText: 'text-red-700 dark:text-red-300'
            };
        }
        return {
            bg: 'bg-yellow-50 dark:bg-yellow-900/20',
            border: 'border-yellow-200 dark:border-yellow-800',
            title: 'text-yellow-800 dark:text-yellow-200',
            text: 'text-yellow-700 dark:text-yellow-300',
            list: 'text-yellow-600 dark:text-yellow-400',
            button: 'text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-800/50 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-200 dark:hover:bg-yellow-800',
            buttonText: 'text-yellow-700 dark:text-yellow-300'
        };
    };

    const bannerStyles = getBannerStyles();
    const bannerTitle = graphHealth.totalNodes === 0 
        ? t('graphPage.emptyGraphTitle')
        : graphHealth.status === 'critical'
        ? t('graphPage.criticalHealthTitle')
        : t('graphPage.warningHealthTitle');

    return (
        <div className={`${bannerStyles.bg} border-b ${bannerStyles.border} p-4`}>
            <div className="flex items-start justify-between max-w-7xl mx-auto">
                <div className="flex-1">
                    <h3 className={`text-sm font-semibold ${bannerStyles.title} mb-2`}>
                        {bannerTitle}
                    </h3>
                    {graphHealth.totalNodes === 0 ? (
                        <p className={`text-sm ${bannerStyles.text} mb-2`}>
                            {t('graphPage.emptyGraphDescription')}
                        </p>
                    ) : (
                        <p className={`text-sm ${bannerStyles.text} mb-2`}>
                            {t('graphPage.graphStats')
                                .replace('{{nodes}}', String(graphHealth.totalNodes))
                                .replace('{{edges}}', String(graphHealth.totalEdges))}
                            {graphHealth.connectivity.hasRoot ? '' : ` ${t('graphPage.noRootNode')}`}
                            {graphHealth.connectivity.connectivityRatio > 0 && (
                                ` ${t('graphPage.connectivityPercentage').replace('{{percentage}}', String(Math.round(graphHealth.connectivity.connectivityRatio * 100)))}`
                            )}
                        </p>
                    )}
                    {graphHealth.recommendations.length > 0 && (
                        <ul className={`text-sm ${bannerStyles.list} list-disc list-inside space-y-1 mb-3`}>
                            {graphHealth.recommendations.map((rec, idx) => (
                                <li key={idx}>{rec}</li>
                            ))}
                        </ul>
                    )}
                    <div className="mt-3 flex gap-2">
                        <a
                            href="/beleidsscan"
                            className={`inline-flex items-center px-3 py-1.5 text-sm font-medium ${bannerStyles.button} border rounded-md transition-colors`}
                        >
                            {t('graphPage.runWorkflow')}
                        </a>
                        {graphHealth.status === 'critical' && (
                            <a
                                href="/admin"
                                className={`inline-flex items-center px-3 py-1.5 text-sm font-medium ${bannerStyles.button} border rounded-md transition-colors`}
                            >
                                {t('graphPage.adminTools')}
                            </a>
                        )}
                        <button
                            onClick={onDismiss}
                            className={`inline-flex items-center px-3 py-1.5 text-sm font-medium ${bannerStyles.buttonText} hover:opacity-80`}
                        >
                            {t('graphPage.dismiss')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
