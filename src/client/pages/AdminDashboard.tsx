import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminMetrics } from '../hooks/useAdminMetrics';
import { useWebSocket, ThresholdAlert } from '../hooks/useWebSocket';
import { ErrorDetailModal } from '../components/ErrorDetailModal';
import { logError } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import { LearningDashboard } from '../components/admin/LearningDashboard';
import { MetadataQualityDashboard } from '../components/admin/MetadataQualityDashboard';
import { AICrawlingConfig } from '../components/admin/AICrawlingConfig';
import { AICrawlingTraceViewer } from '../components/admin/AICrawlingTraceViewer';
import { HierarchyViewer } from '../components/admin/HierarchyViewer';
import { WorkflowMonitoringDashboard } from '../components/admin/WorkflowMonitoringDashboard';
import { QueryIdLinkageDashboard } from '../components/admin/QueryIdLinkageDashboard';
import { ThresholdManagementTab } from '../components/admin/ThresholdManagementTab';
import { ErrorMonitoringTab } from '../components/admin/ErrorMonitoringTab';
import { UsersManagementTab } from '../components/admin/UsersManagementTab';
import { WorkflowsTab } from '../components/admin/WorkflowsTab';
import { OverviewTab } from '../components/admin/OverviewTab';
import { LogsTab } from '../components/admin/LogsTab';
import { AuditLogsTab } from '../components/admin/AuditLogsTab';

// Type definitions have been moved to their respective component files

export function AdminDashboard() {
    const { user } = useAuth();

    // Refresh interval state (in milliseconds)
    const [refreshInterval, setRefreshInterval] = useState<number>(30000); // 30 seconds default
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);

    // Use the new hook for metrics with auto-refresh
    const { metrics, loading: _metricsLoading, error: metricsError, refresh: refreshMetrics, isRefreshing } = useAdminMetrics({
        refreshInterval: autoRefreshEnabled ? refreshInterval : 0,
        enabled: autoRefreshEnabled
    });

    // User and workflow state has been moved to UsersManagementTab and WorkflowsTab components
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'workflows' | 'workflow-monitoring' | 'queryid-linkage' | 'logs' | 'audit-logs' | 'thresholds' | 'errors' | 'learning' | 'metadata-quality' | 'ai-crawling' | 'ai-crawling-traces' | 'hierarchy'>('overview');
    const [loading, setLoading] = useState(true);
    // Logs, trends, and audit logs state has been moved to their respective tab components

    // Error detail modal state
    const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);

    // WebSocket connection for real-time updates (Phase 3.1)
    const { connected: wsConnected, error: wsError, reconnect: wsReconnect } = useWebSocket({
        enabled: autoRefreshEnabled && user?.role === 'admin',
        onMetricsUpdate: () => {
            // Update metrics from WebSocket
            refreshMetrics();
        },
        onThresholdAlert: (alert: ThresholdAlert) => {
            // Show threshold alert notification
            if (alert.severity === 'critical') {
                toast.error(
                    'Critical Threshold Exceeded',
                    `${alert.metric} is ${alert.current_value} (threshold: ${alert.threshold})`
                );
            } else {
                toast.warning(
                    'Threshold Alert',
                    `${alert.metric} is ${alert.current_value} (threshold: ${alert.threshold})`
                );
            }
        },
    });

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            // Users and workflows are now loaded by their respective tab components
        } catch (_error) {
            logError(_error, 'load-admin-data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user?.role !== 'admin') {
            return;
        }
        loadData();
    }, [user, loadData]);

    // User filtering has been moved to UsersManagementTab component

    // Manual refresh function that refreshes both metrics and other data
    const handleManualRefresh = async () => {
        await Promise.all([refreshMetrics(), loadData()]);
    };

    // Logs, trends, and audit logs loading has been moved to their respective tab components

    // Close error detail modal when tab changes
    useEffect(() => {
        setSelectedErrorId(null);
    }, [activeTab]);

    // Note: updateUserRole, updateUserStatus, updateTourGuideStatus, and resetUserPassword 
    // have been moved to UsersManagementTab component. These functions are no longer needed 
    // here as user management is handled in the tab component.

    // Note: createUser and deleteUser have been moved to UsersManagementTab component


    // Export functions have been moved to LogsTab and AuditLogsTab components

    if (user?.role !== 'admin') {
        return (
            <div className="p-8">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h2 className="text-red-800 font-semibold">Access Denied</h2>
                    <p className="text-red-600">You must be an administrator to access this page.</p>
                </div>
            </div>
        );
    }

    // Show loading only on initial load, not on refresh
    if (loading && !metrics) {
        return (
            <div className="p-8">
                <div className="text-center">Loading admin dashboard...</div>
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Admin Dashboard</h1>

                {/* Refresh Controls */}
                <div className="flex items-center gap-4">
                    {/* Refresh Indicator */}
                    {isRefreshing && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            <span>Refreshing...</span>
                        </div>
                    )}

                    {/* Auto-refresh Toggle */}
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={autoRefreshEnabled}
                            onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Auto-refresh</span>
                    </label>

                    {/* Refresh Interval Selector */}
                    {autoRefreshEnabled && (
                        <select
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(Number(e.target.value))}
                            className="border border-gray-300 rounded px-3 py-1 text-sm"
                        >
                            <option value={30000}>30 seconds</option>
                            <option value={60000}>1 minute</option>
                            <option value={300000}>5 minutes</option>
                        </select>
                    )}

                    {/* Manual Refresh Button */}
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing || loading}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-sm"
                    >
                        {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {metricsError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                        <p className="text-red-800 text-sm font-medium">Error loading metrics: {metricsError.message}</p>
                        {metrics && (
                            <p className="text-red-600 text-xs mt-1">Showing last known data. Click refresh to retry.</p>
                        )}
                    </div>
                    <button
                        onClick={() => refreshMetrics()}
                        className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* WebSocket Status */}
            {autoRefreshEnabled && (
                <div className="mb-4 flex items-center gap-2 text-sm" data-testid="websocket-status">
                    <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className={wsConnected ? 'text-green-700' : 'text-red-700'}>
                        WebSocket: {wsConnected ? 'Connected' : 'Disconnected'}
                    </span>
                    {!wsConnected && (
                        <>
                            {wsError && (
                                <span className="text-red-600 text-xs ml-2">
                                    ({wsError.message})
                                </span>
                            )}
                            <button
                                onClick={wsReconnect}
                                className="text-blue-600 hover:text-blue-800 underline text-xs ml-2"
                            >
                                Reconnect
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
                <nav className="flex space-x-8">
                    {(['overview', 'users', 'workflows', 'workflow-monitoring', 'queryid-linkage', 'logs', 'audit-logs', 'thresholds', 'errors', 'learning', 'metadata-quality', 'ai-crawling', 'ai-crawling-traces', 'hierarchy'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            data-testid={`admin-tab-${tab}`}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                                }`}
                        >
                            {tab === 'audit-logs' ? 'Audit Logs' : tab === 'learning' ? 'Learning & Quality' : tab === 'metadata-quality' ? 'Metadata Quality' : tab === 'ai-crawling' ? 'AI Crawling Config' : tab === 'ai-crawling-traces' ? 'AI Crawling Traces' : tab === 'hierarchy' ? 'Hierarchy' : tab === 'workflow-monitoring' ? 'Workflow Monitoring' : tab === 'queryid-linkage' ? 'QueryId Linkage' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && <OverviewTab onErrorSelect={setSelectedErrorId} />}


            {/* Users Tab */}
            {activeTab === 'users' && <UsersManagementTab />}


            {/* Workflows Tab */}
            {activeTab === 'workflows' && <WorkflowsTab />}


            {/* Logs Tab */}
            {activeTab === 'logs' && <LogsTab />}


            {/* Audit Logs Tab */}
            {activeTab === 'audit-logs' && <AuditLogsTab />}


            {/* Thresholds Tab */}
            {activeTab === 'thresholds' && <ThresholdManagementTab />}

            {/* Errors Tab */}
            {activeTab === 'errors' && <ErrorMonitoringTab onErrorSelect={setSelectedErrorId} />}

            {/* Learning & Quality Tab */}
            {activeTab === 'learning' && <LearningDashboard />}

            {/* Metadata Quality Tab */}
            {activeTab === 'metadata-quality' && <MetadataQualityDashboard />}

            {/* AI Crawling Configuration Tab */}
            {activeTab === 'ai-crawling' && <AICrawlingConfig />}

            {/* AI Crawling Traces Tab */}
            {activeTab === 'ai-crawling-traces' && <AICrawlingTraceViewer />}

            {/* Hierarchy Management Tab */}
            {activeTab === 'hierarchy' && <HierarchyViewer />}

            {/* Workflow Monitoring Tab */}
            {activeTab === 'workflow-monitoring' && <WorkflowMonitoringDashboard />}

            {/* QueryId Linkage Tab */}
            {activeTab === 'queryid-linkage' && <QueryIdLinkageDashboard />}

            {/* User dialogs have been moved to UsersManagementTab component */}

            {/* Error Detail Modal */}
            <ErrorDetailModal
                errorId={selectedErrorId}
                onClose={() => setSelectedErrorId(null)}
                onResolve={() => {
                    refreshMetrics();
                    setSelectedErrorId(null);
                }}
            />
        </div>
    );
}

// ThresholdManagementTab has been extracted to src/client/components/admin/ThresholdManagementTab.tsx

// ScheduleDialog has been extracted to src/client/components/admin/ScheduleDialog.tsx

// ErrorMonitoringTab has been extracted to src/client/components/admin/ErrorMonitoringTab.tsx


// WorkflowDetailsPanel has been extracted to src/client/components/admin/WorkflowDetailsPanel.tsx

