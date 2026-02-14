import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Beleidsscan } from './components/Beleidsscan';
import { WorkflowPage } from './pages/WorkflowPage';
import { RunsPage } from './pages/RunsPage';
import { GraphPage } from './pages/GraphPage';
import { CommonCrawlPage } from './pages/CommonCrawlPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SearchPageWrapper } from './pages/SearchPageWrapper';
import { BenchmarkPage } from './pages/BenchmarkPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { HelpCenter } from './pages/HelpCenter';
import { TutorialPage } from './pages/TutorialPage';
import { HierarchyExplorer } from './pages/HierarchyExplorer';
import { TestDetailPage } from './pages/TestDetailPage';
import { TestDashboardPage } from './pages/TestDashboardPage';
import { TestHistoryTimelinePage } from './pages/TestHistoryTimelinePage';
import { TestHealthPage } from './pages/TestHealthPage';
import { TestTrendsPage } from './pages/TestTrendsPage';
import { TestPerformancePage } from './pages/TestPerformancePage';
import { TestCoveragePage } from './pages/TestCoveragePage';
import { TestReportsPage } from './pages/TestReportsPage';
import { TestDocumentationPage } from './pages/TestDocumentationPage';
import { TestErrorsPage } from './pages/TestErrorsPage';
import { TestSummaryPage } from './pages/TestSummaryPage';
import { TestComparisonPage } from './pages/TestComparisonPage';
import { TestRunDetailPage } from './pages/TestRunDetailPage';
import { SustainabilityPage } from './pages/SustainabilityPage';
import { CachingDashboard } from './pages/sustainability/CachingDashboard';
import { SingleSearchDashboard } from './pages/sustainability/SingleSearchDashboard';
import { TextReuseDashboard } from './pages/sustainability/TextReuseDashboard';
import { EfficientAlgorithmsDashboard } from './pages/sustainability/EfficientAlgorithmsDashboard';
import { DataStorageDashboard } from './pages/sustainability/DataStorageDashboard';
import { ServerOptimizationDashboard } from './pages/sustainability/ServerOptimizationDashboard';
import { ScalableArchitectureDashboard } from './pages/sustainability/ScalableArchitectureDashboard';
import { FeatureFlagsPage } from './pages/FeatureFlagsPage';
import { FeatureFlagTemplatesPage } from './pages/FeatureFlagTemplatesPage';
import { WorkflowComparisonPage } from './pages/WorkflowComparisonPage';
import { ExportTemplatesPage } from './pages/ExportTemplatesPage';
import { BeleidsscanConfigurationPage } from './pages/BeleidsscanConfigurationPage';
import { SamenvatterPage } from './pages/SamenvatterPage';
import { Toaster } from './components/ui/sonner';

// Wrapper components for protected routes
function ProtectedBeleidsscan() {
  return (
    <ProtectedRoute>
      <Beleidsscan onBack={() => {
        // Use window.location for navigation outside router context
        window.location.href = '/';
      }} />
    </ProtectedRoute>
  );
}

function ProtectedHome() {
  return (
    <ProtectedRoute>
      <Navigate to="/workflows" replace />
    </ProtectedRoute>
  );
}

function ProtectedWorkflows() {
  return (
    <ProtectedRoute>
      <Layout><WorkflowPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedRuns() {
  return (
    <ProtectedRoute>
      <Layout><RunsPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedGraph() {
  return (
    <ProtectedRoute>
      <Layout><GraphPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedCommonCrawl() {
  return (
    <ProtectedRoute>
      <Layout><CommonCrawlPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedKnowledge() {
  return (
    <ProtectedRoute>
      <Layout><KnowledgePage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedBenchmark() {
  return (
    <ProtectedRoute>
      <Layout><BenchmarkPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedSearch() {
  return (
    <ProtectedRoute>
      <Layout><SearchPageWrapper /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedAdmin() {
  return (
    <ProtectedRoute>
      <Layout><AdminDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedHierarchyExplorer() {
  return (
    <ProtectedRoute>
      <Layout><HierarchyExplorer /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedHelp() {
  return (
    <ProtectedRoute>
      <Layout><HelpCenter /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTutorial() {
  return (
    <ProtectedRoute>
      <Layout><TutorialPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestDetail() {
  return (
    <ProtectedRoute>
      <Layout><TestDetailPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedSustainability() {
  return (
    <ProtectedRoute>
      <Layout><SustainabilityPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedCachingDashboard() {
  return (
    <ProtectedRoute>
      <Layout><CachingDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedSingleSearchDashboard() {
  return (
    <ProtectedRoute>
      <Layout><SingleSearchDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTextReuseDashboard() {
  return (
    <ProtectedRoute>
      <Layout><TextReuseDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedEfficientAlgorithmsDashboard() {
  return (
    <ProtectedRoute>
      <Layout><EfficientAlgorithmsDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedDataStorageDashboard() {
  return (
    <ProtectedRoute>
      <Layout><DataStorageDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedServerOptimizationDashboard() {
  return (
    <ProtectedRoute>
      <Layout><ServerOptimizationDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedScalableArchitectureDashboard() {
  return (
    <ProtectedRoute>
      <Layout><ScalableArchitectureDashboard /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestDashboard() {
  return (
    <ProtectedRoute>
      <Layout><TestDashboardPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestHistoryTimeline() {
  return (
    <ProtectedRoute>
      <Layout><TestHistoryTimelinePage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestHealth() {
  return (
    <ProtectedRoute>
      <Layout><TestHealthPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestTrends() {
  return (
    <ProtectedRoute>
      <Layout><TestTrendsPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestPerformance() {
  return (
    <ProtectedRoute>
      <Layout><TestPerformancePage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestCoverage() {
  return (
    <ProtectedRoute>
      <Layout><TestCoveragePage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestReports() {
  return (
    <ProtectedRoute>
      <Layout><TestReportsPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestDocumentation() {
  return (
    <ProtectedRoute>
      <Layout><TestDocumentationPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestErrors() {
  return (
    <ProtectedRoute>
      <Layout><TestErrorsPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestSummary() {
  return (
    <ProtectedRoute>
      <Layout><TestSummaryPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestComparison() {
  return (
    <ProtectedRoute>
      <Layout><TestComparisonPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedTestRunDetail() {
  return (
    <ProtectedRoute>
      <Layout><TestRunDetailPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedFeatureFlags() {
  return (
    <ProtectedRoute>
      <Layout><FeatureFlagsPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedFeatureFlagTemplates() {
  return (
    <ProtectedRoute>
      <Layout><FeatureFlagTemplatesPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedWorkflowComparison() {
  return (
    <ProtectedRoute>
      <Layout><WorkflowComparisonPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedExportTemplates() {
  return (
    <ProtectedRoute>
      <Layout><ExportTemplatesPage /></Layout>
    </ProtectedRoute>
  );
}

function ProtectedBeleidsscanConfiguration() {
  return (
    <ProtectedRoute>
      <BeleidsscanConfigurationPage />
    </ProtectedRoute>
  );
}

function ProtectedSamenvatter() {
  return (
    <ProtectedRoute>
      <Layout><SamenvatterPage /></Layout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Toaster />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route path="/beleidsscan" element={<ProtectedBeleidsscan />} />
        <Route path="/" element={<ProtectedHome />} />
        <Route path="/workflows" element={<ProtectedWorkflows />} />
        <Route path="/runs" element={<ProtectedRuns />} />
        <Route path="/graph" element={<ProtectedGraph />} />
        <Route path="/commoncrawl" element={<ProtectedCommonCrawl />} />
        <Route path="/knowledge" element={<ProtectedKnowledge />} />
        <Route path="/search" element={<ProtectedSearch />} />
        <Route path="/benchmark" element={<ProtectedBenchmark />} />
        <Route path="/admin" element={<ProtectedAdmin />} />
        <Route path="/hierarchy" element={<ProtectedHierarchyExplorer />} />
        <Route path="/help" element={<ProtectedHelp />} />
        <Route path="/help/tutorial/:tutorialId" element={<ProtectedTutorial />} />
        <Route path="/tests" element={<ProtectedTestDashboard />} />
        <Route path="/tests/trends" element={<ProtectedTestTrends />} />
        <Route path="/tests/health" element={<ProtectedTestHealth />} />
        <Route path="/tests/performance" element={<ProtectedTestPerformance />} />
        <Route path="/tests/coverage" element={<ProtectedTestCoverage />} />
        <Route path="/tests/reports" element={<ProtectedTestReports />} />
        <Route path="/tests/documentation" element={<ProtectedTestDocumentation />} />
        <Route path="/tests/errors" element={<ProtectedTestErrors />} />
        <Route path="/tests/summary" element={<ProtectedTestSummary />} />
        <Route path="/tests/comparison" element={<ProtectedTestComparison />} />
        <Route path="/tests/runs/:runId" element={<ProtectedTestRunDetail />} />
        <Route path="/tests/timeline" element={<ProtectedTestHistoryTimeline />} />
        <Route path="/tests/:testId" element={<ProtectedTestDetail />} />
        <Route path="/sustainability" element={<ProtectedSustainability />} />
        <Route path="/sustainability/caching" element={<ProtectedCachingDashboard />} />
        <Route path="/sustainability/single-search" element={<ProtectedSingleSearchDashboard />} />
        <Route path="/sustainability/text-reuse" element={<ProtectedTextReuseDashboard />} />
        <Route path="/sustainability/efficient-algorithms" element={<ProtectedEfficientAlgorithmsDashboard />} />
        <Route path="/sustainability/data-storage" element={<ProtectedDataStorageDashboard />} />
        <Route path="/sustainability/server-optimization" element={<ProtectedServerOptimizationDashboard />} />
        <Route path="/sustainability/scalable-architecture" element={<ProtectedScalableArchitectureDashboard />} />
        <Route path="/feature-flags" element={<ProtectedFeatureFlags />} />
        <Route path="/feature-flags/templates" element={<ProtectedFeatureFlagTemplates />} />
        <Route path="/workflows/compare" element={<ProtectedWorkflowComparison />} />
        <Route path="/export-templates" element={<ProtectedExportTemplates />} />
        <Route path="/beleidsscan/configuration" element={<ProtectedBeleidsscanConfiguration />} />
        <Route path="/samenvatter" element={<ProtectedSamenvatter />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
