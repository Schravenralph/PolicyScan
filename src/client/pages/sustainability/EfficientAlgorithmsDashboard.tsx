import { TrendingDown } from 'lucide-react';
import { FeatureDashboard } from '../../components/sustainability/FeatureDashboard';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

export function EfficientAlgorithmsDashboard() {
  return (
    <FeatureDashboard
      title={t('sustainability.additional.efficient.title')}
      description={t('sustainability.additional.efficient.description')}
      icon={<TrendingDown className="w-8 h-8 text-indigo-600" />}
      featureKey="efficient-algorithms"
      colorScheme={{
        primary: '#4f46e5',
        secondary: '#6366f1',
        accent: '#818cf8',
      }}
      getMetrics={(startDate, endDate) => api.sustainability.getMetrics(startDate, endDate)}
      getKPIs={(startDate, endDate) => api.sustainability.getKPIs(startDate, endDate)}
    />
  );
}

