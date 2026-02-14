/**
 * TestDashboardLoadingError Component
 * 
 * Extracted from TestDashboardPage to improve maintainability.
 * Handles initial loading state and error display for the test dashboard.
 */

import { Loader2, AlertCircle } from 'lucide-react';
import { t } from '../../utils/i18n';

interface TestDashboardLoadingErrorProps {
  loading: boolean;
  hasData: boolean;
  dashboardError: string | null;
  error: string | null;
}

/**
 * Component that displays loading state or error messages for the test dashboard.
 */
export function TestDashboardLoadingError({
  loading,
  hasData,
  dashboardError,
  error,
}: TestDashboardLoadingErrorProps) {
  // Initial loading state
  if (loading && !hasData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">{t('testDashboard.loading')}</p>
        </div>
      </div>
    );
  }

  // Error display
  if (dashboardError || error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <pre className="whitespace-pre-wrap font-sans text-sm">{dashboardError || error}</pre>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
