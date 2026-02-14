/**
 * MetricCard Component
 * 
 * Displays a metric card with title, value, and subtitle.
 */

interface MetricCardProps {
  title: string;
  value: number;
  subtitle: string;
  className?: string;
  onClick?: () => void;
}

export function MetricCard({ title, value, subtitle, className = '', onClick }: MetricCardProps) {
  // Generate test ID from title (e.g., "Total Users" -> "metric-total-users")
  const testId = `metric-${title.toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '')}`;

  return (
    <div
      className={`bg-white rounded-lg shadow p-6 border ${className}`}
      onClick={onClick}
      data-testid={testId}
    >
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

