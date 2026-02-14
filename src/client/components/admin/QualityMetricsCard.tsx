import { useState } from 'react';

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

interface QualityMetricsCardProps {
  metrics: QualityMetrics;
}

export function QualityMetricsCard({ metrics }: QualityMetricsCardProps) {
  const [documentSortBy, setDocumentSortBy] = useState<'quality' | 'clicks' | 'accepts'>('quality');
  const [documentOrder, setDocumentOrder] = useState<'asc' | 'desc'>('desc');
  const [showTopDocuments, setShowTopDocuments] = useState(true);

  const sortedDocuments = [...metrics.documentQuality].sort((a, b) => {
    let aValue: number;
    let bValue: number;

    switch (documentSortBy) {
      case 'quality':
        aValue = a.qualityScore;
        bValue = b.qualityScore;
        break;
      case 'clicks':
        aValue = a.clicks;
        bValue = b.clicks;
        break;
      case 'accepts':
        aValue = a.accepts;
        bValue = b.accepts;
        break;
      default:
        aValue = a.qualityScore;
        bValue = b.qualityScore;
    }

    return documentOrder === 'asc' ? aValue - bValue : bValue - aValue;
  });

  const displayedDocuments = showTopDocuments
    ? sortedDocuments.slice(0, 10)
    : sortedDocuments.slice(-10);

  const hasData = metrics.documentQuality.length > 0 || metrics.sourceQuality.length > 0 || 
                  metrics.overallCTR > 0 || metrics.overallAcceptanceRate > 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-xl font-semibold mb-4">Quality Metrics</h3>

      {!hasData ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-6 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-yellow-800">No Quality Data Available</h4>
              <p className="mt-1 text-sm text-yellow-700">
                There is no feedback data available yet. Quality metrics will appear here once users start interacting with documents.
                <br />
                <span className="font-medium">Tip:</span> Try lowering the "Min Interactions" and "Min Documents" thresholds if you expect data to be available.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Overall Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded p-4">
              <h4 className="text-sm font-medium text-gray-600 mb-1">Overall CTR</h4>
              <p className="text-2xl font-bold text-blue-600">
                {(metrics.overallCTR * 100).toFixed(1)}%
              </p>
            </div>
            <div className="bg-green-50 rounded p-4">
              <h4 className="text-sm font-medium text-gray-600 mb-1">Acceptance Rate</h4>
              <p className="text-2xl font-bold text-green-600">
                {(metrics.overallAcceptanceRate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="bg-purple-50 rounded p-4">
              <h4 className="text-sm font-medium text-gray-600 mb-1">Total Documents</h4>
              <p className="text-2xl font-bold text-purple-600">
                {metrics.documentQuality.length}
              </p>
            </div>
          </div>
        </>
      )}

      {hasData && (
        <>
      {/* Document Quality Table */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-lg font-medium">Document Quality</h4>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setShowTopDocuments(!showTopDocuments)}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
            >
              {showTopDocuments ? 'Show Bottom' : 'Show Top'}
            </button>
            <select
              value={documentSortBy}
              onChange={(e) => setDocumentSortBy(e.target.value as 'quality' | 'clicks' | 'accepts')}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="quality">Sort by Quality</option>
              <option value="clicks">Sort by Clicks</option>
              <option value="accepts">Sort by Accepts</option>
            </select>
            <button
              onClick={() => setDocumentOrder(documentOrder === 'asc' ? 'desc' : 'asc')}
              className="text-sm px-3 py-1 border rounded hover:bg-gray-50"
            >
              {documentOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {metrics.documentQuality.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No document quality data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Document ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quality Score</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Clicks</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Accepts</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rejects</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedDocuments.map((doc) => (
                  <tr key={doc.documentId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-mono text-gray-900">
                      {doc.documentId.substring(0, 8)}...
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className={`h-2 rounded-full ${
                              doc.qualityScore > 0.7 ? 'bg-green-500' :
                              doc.qualityScore > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${doc.qualityScore * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-700">{(doc.qualityScore * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">{doc.clicks}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{doc.accepts}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{doc.rejects}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {doc.rating > 0 ? doc.rating.toFixed(1) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Source Quality */}
      <div>
        <h4 className="text-lg font-medium mb-3">Source Quality</h4>
        {metrics.sourceQuality.length === 0 ? (
          <div className="text-center py-4 text-gray-500">No source quality data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source URL</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quality Score</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Documents</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acceptance Rate</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">CTR</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {metrics.sourceQuality.slice(0, 10).map((source) => (
                  <tr key={source.sourceUrl} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900 truncate max-w-xs" title={source.sourceUrl}>
                      {source.sourceUrl}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className={`h-2 rounded-full ${
                              source.qualityScore > 0.7 ? 'bg-green-500' :
                              source.qualityScore > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${source.qualityScore * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-700">{(source.qualityScore * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">{source.documentCount}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {(source.acceptanceRate * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {(source.clickThroughRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}


