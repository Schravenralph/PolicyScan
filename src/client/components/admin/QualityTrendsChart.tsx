import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface QualityTrendsChartProps {
  dateRange: '7d' | '30d' | '90d' | 'all';
  onDateRangeChange: (range: '7d' | '30d' | '90d' | 'all') => void;
}

// Mock data for now - in a real implementation, this would come from the API
// with historical data points
const generateMockData = (range: '7d' | '30d' | '90d' | 'all') => {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 180;
  const data = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Generate mock trend data
    const baseCTR = 0.15 + Math.random() * 0.1;
    const baseAcceptance = 0.6 + Math.random() * 0.2;
    
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ctr: (baseCTR * 100).toFixed(1),
      acceptanceRate: (baseAcceptance * 100).toFixed(1),
    });
  }

  return data;
};

export function QualityTrendsChart({ dateRange, onDateRangeChange }: QualityTrendsChartProps) {
  const chartData = generateMockData(dateRange);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Quality Trends</h3>
        <div className="flex gap-2">
          {(['7d', '30d', '90d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => onDateRangeChange(range)}
              className={`px-3 py-1 text-sm rounded ${
                dateRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range === 'all' ? 'All Time' : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="ctr"
              stroke="#3b82f6"
              strokeWidth={2}
              name="CTR (%)"
            />
            <Line
              type="monotone"
              dataKey="acceptanceRate"
              stroke="#10b981"
              strokeWidth={2}
              name="Acceptance Rate (%)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p>Note: Historical trend data is currently using mock data. Real historical data will be available once feedback collection has been running for a sufficient period.</p>
      </div>
    </div>
  );
}


