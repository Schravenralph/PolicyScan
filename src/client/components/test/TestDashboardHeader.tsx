/**
 * Test Dashboard Header Component
 * 
 * Displays the dashboard header with title, action buttons, export menu,
 * keyboard shortcuts dialog, and notification controls.
 */

import { useState } from 'react';
import { RefreshCw, Radio, Download, Keyboard, Bell, BellOff, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import type { DashboardData } from '../../services/api/TestApiService';
import { t } from '../../utils/i18n';

interface TestDashboardHeaderProps {
  dashboardData: DashboardData | null;
  displayedTestRuns: any[] | null;
  realTimeUpdatesEnabled: boolean;
  notificationsEnabled: boolean;
  notificationPermission: NotificationPermission;
  onToggleRealTimeUpdates: () => void;
  onRefresh: () => void;
  onToggleNotifications: () => void;
  onExportDashboardDataJSON: () => void;
  onExportTestRunsJSON: () => void;
  onExportTestRunsCSV: () => void;
}

export function TestDashboardHeader({
  dashboardData,
  displayedTestRuns,
  realTimeUpdatesEnabled,
  notificationsEnabled,
  notificationPermission,
  onToggleRealTimeUpdates,
  onRefresh,
  onToggleNotifications,
  onExportDashboardDataJSON,
  onExportTestRunsJSON,
  onExportTestRunsCSV,
}: TestDashboardHeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('testDashboard.title')}</h1>
          <p className="text-gray-600 mt-1">{t('testDashboard.description')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {dashboardData?.lastUpdated && (
            <span className="text-sm text-gray-500">
              {t('testDashboard.lastUpdated')}: {new Date(dashboardData.lastUpdated).toLocaleString()}
            </span>
          )}
          <Button
            onClick={onToggleRealTimeUpdates}
            variant={realTimeUpdatesEnabled ? "default" : "outline"}
            size="sm"
            title={realTimeUpdatesEnabled ? t('testDashboard.disableRealTime') : t('testDashboard.enableRealTime')}
          >
            <Radio className={`w-4 h-4 mr-2 ${realTimeUpdatesEnabled ? 'animate-pulse' : ''}`} />
            {realTimeUpdatesEnabled ? t('testDashboard.realTimeOn') : t('testDashboard.realTimeOff')}
          </Button>
          <Button 
            onClick={onRefresh} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('common.refresh')}
          </Button>
          {dashboardData && (
            <div className="relative inline-block">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExportMenu(prev => !prev)}
              >
                <Download className="w-4 h-4 mr-2" />
                {t('common.export')}
              </Button>
              {showExportMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 mt-1 w-48 bg-card border-2 border-border rounded-md shadow-2xl z-20">
                    <div className="py-1">
                      <button
                        onClick={() => {
                          onExportDashboardDataJSON();
                          setShowExportMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        {t('testDashboard.exportDashboardData')}
                      </button>
                      <button
                        onClick={() => {
                          onExportTestRunsJSON();
                          setShowExportMenu(false);
                        }}
                        disabled={!displayedTestRuns || displayedTestRuns.length === 0}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileText className="w-4 h-4" />
                        {t('testDashboard.exportTestRunsJson')}
                      </button>
                      <button
                        onClick={() => {
                          onExportTestRunsCSV();
                          setShowExportMenu(false);
                        }}
                        disabled={!displayedTestRuns || displayedTestRuns.length === 0}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileText className="w-4 h-4" />
                        {t('testDashboard.exportTestRunsCsv')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKeyboardShortcuts(true)}
            title={t('testDashboard.keyboardShortcutsTitle')}
          >
            <Keyboard className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{t('testDashboard.shortcuts')}</span>
            <span className="sm:hidden">?</span>
          </Button>
          {'Notification' in window && (
            <Button
              variant={notificationsEnabled && notificationPermission === 'granted' ? "default" : "outline"}
              size="sm"
              onClick={onToggleNotifications}
              title={
                notificationPermission === 'granted'
                  ? notificationsEnabled
                    ? t('testDashboard.disableNotifications')
                    : t('testDashboard.enableNotifications')
                  : t('testDashboard.requestNotificationPermission')
              }
            >
              {notificationsEnabled && notificationPermission === 'granted' ? (
                <Bell className="w-4 h-4 mr-2" />
              ) : (
                <BellOff className="w-4 h-4 mr-2" />
              )}
              <span className="hidden sm:inline">
                {notificationPermission === 'granted'
                  ? notificationsEnabled
                    ? t('testDashboard.notificationsOn')
                    : t('testDashboard.notificationsOff')
                  : t('testDashboard.enableNotifications')}
              </span>
              <span className="sm:hidden">
                {notificationsEnabled && notificationPermission === 'granted' ? '🔔' : '🔕'}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Help Dialog */}
      <Dialog open={showKeyboardShortcuts} onOpenChange={setShowKeyboardShortcuts}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              {t('testDashboard.keyboardShortcuts')}
            </DialogTitle>
            <DialogDescription>
              {t('testDashboard.keyboardShortcutsDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-semibold text-sm">{t('testDashboard.shortcutRefreshDashboard')}</div>
                    <div className="text-xs text-gray-600">{t('testDashboard.shortcutRefreshDashboardDesc')}</div>
                  </div>
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">R</kbd>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-semibold text-sm">{t('testDashboard.shortcutRunAllTests')}</div>
                    <div className="text-xs text-gray-600">{t('testDashboard.shortcutRunAllTestsDesc')}</div>
                  </div>
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">T</kbd>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-semibold text-sm">{t('testDashboard.shortcutExportMenu')}</div>
                    <div className="text-xs text-gray-600">{t('testDashboard.shortcutExportMenuDesc')}</div>
                  </div>
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">E</kbd>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-semibold text-sm">{t('testDashboard.shortcutShowShortcuts')}</div>
                    <div className="text-xs text-gray-600">{t('testDashboard.shortcutShowShortcutsDesc')}</div>
                  </div>
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">?</kbd>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <div className="font-semibold text-sm">{t('testDashboard.shortcutCloseMenu')}</div>
                    <div className="text-xs text-gray-600">{t('testDashboard.shortcutCloseMenuDesc')}</div>
                  </div>
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Esc</kbd>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-xs text-blue-800 font-semibold mb-1">{t('testDashboard.tip')}</div>
                  <div className="text-xs text-blue-700">
                    {t('testDashboard.shortcutsDisabledNote')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

