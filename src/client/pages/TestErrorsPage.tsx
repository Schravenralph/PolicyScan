import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { ErrorOverview } from '../components/test/ErrorOverview';
import { ErrorExplorer } from '../components/test/ErrorExplorer';
import { ErrorPatterns } from '../components/test/ErrorPatterns';
import { ErrorCorrelation } from '../components/test/ErrorCorrelation';

export function TestErrorsPage() {

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">🔍 Error Analysis</h1>
          <p className="text-gray-600 mt-1">Analyze test errors, patterns, and correlations</p>
        </div>
      </div>

      {/* Error Overview Section */}
      <ErrorOverview />

      {/* Error Explorer Section */}
      <ErrorExplorer />

      {/* Error Patterns Section */}
      <ErrorPatterns />

      {/* Error Correlation Section */}
      <ErrorCorrelation />
    </div>
  );
}

