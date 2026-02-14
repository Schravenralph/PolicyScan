interface QualityMetrics {
  documentQuality: Array<{
    documentId: string;
    clicks: number;
    accepts: number;
    rejects: number;
    rating: number;
    qualityScore: number;
  }>;
  sourceQuality: Array<{
    sourceUrl: string;
    documentCount: number;
    averageRating: number;
    acceptanceRate: number;
    clickThroughRate: number;
    qualityScore: number;
  }>;
  termImportance: Array<{
    term: string;
    frequency: number;
    averageRating: number;
    associatedAcceptRate: number;
    importanceScore: number;
  }>;
  overallCTR: number;
  overallAcceptanceRate: number;
}

interface FeedbackStatsCardProps {
  metrics: QualityMetrics;
}

export function FeedbackStatsCard({ metrics }: FeedbackStatsCardProps) {
  // Calculate total interactions
  const totalInteractions = metrics.documentQuality.reduce(
    (sum, doc) => sum + doc.clicks + doc.accepts + doc.rejects,
    0
  );

  const totalClicks = metrics.documentQuality.reduce((sum, doc) => sum + doc.clicks, 0);
  const totalAccepts = metrics.documentQuality.reduce((sum, doc) => sum + doc.accepts, 0);
  const totalRejects = metrics.documentQuality.reduce((sum, doc) => sum + doc.rejects, 0);

  // Top terms by importance
  const topTerms = [...metrics.termImportance]
    .sort((a, b) => b.importanceScore - a.importanceScore)
    .slice(0, 10);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-xl font-semibold mb-4">Feedback Statistics</h3>

      {/* Interaction Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded p-4">
          <h4 className="text-sm font-medium text-gray-600 mb-1">Total Interactions</h4>
          <p className="text-2xl font-bold text-blue-600">{totalInteractions}</p>
        </div>
        <div className="bg-green-50 rounded p-4">
          <h4 className="text-sm font-medium text-gray-600 mb-1">Total Clicks</h4>
          <p className="text-2xl font-bold text-green-600">{totalClicks}</p>
        </div>
        <div className="bg-purple-50 rounded p-4">
          <h4 className="text-sm font-medium text-gray-600 mb-1">Total Accepts</h4>
          <p className="text-2xl font-bold text-purple-600">{totalAccepts}</p>
        </div>
        <div className="bg-red-50 rounded p-4">
          <h4 className="text-sm font-medium text-gray-600 mb-1">Total Rejects</h4>
          <p className="text-2xl font-bold text-red-600">{totalRejects}</p>
        </div>
      </div>

      {/* Term Importance */}
      <div>
        <h4 className="text-lg font-medium mb-3">Top Terms by Importance</h4>
        {metrics.termImportance.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No term importance data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Term</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Importance Score</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Avg Rating</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Accept Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {topTerms.map((term) => (
                  <tr key={term.term} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{term.term}</td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className={`h-2 rounded-full ${
                              term.importanceScore > 0.7 ? 'bg-green-500' :
                              term.importanceScore > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${term.importanceScore * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-700">{(term.importanceScore * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">{term.frequency}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {term.averageRating > 0 ? term.averageRating.toFixed(1) : 'N/A'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {(term.associatedAcceptRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


