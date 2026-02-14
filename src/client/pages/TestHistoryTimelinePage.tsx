import { TestHistoryTimeline } from '../components/test/TestHistoryTimeline';
import { useNavigate } from 'react-router-dom';

export function TestHistoryTimelinePage() {
  const navigate = useNavigate();

  const handleRunClick = (runId: string) => {
    // Navigate to test detail page with the run ID
    navigate(`/test-detail/${runId}`);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Test History Timeline</h1>
        <p className="text-gray-600">
          Interactive timeline showing test execution history with filters and zoom functionality.
        </p>
      </div>
      <TestHistoryTimeline onRunClick={handleRunClick} />
    </div>
  );
}

