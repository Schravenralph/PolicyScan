import { Zap } from 'lucide-react';
import { FeatureDashboard } from '../../components/sustainability/FeatureDashboard';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

export function ServerOptimizationDashboard() {
  return (
    <FeatureDashboard
      title={t('sustainability.additional.optimization.title')}
      description={t('sustainability.additional.optimization.description')}
      icon={<Zap className="w-8 h-8 text-amber-600" />}
      featureKey="server-optimization"
      colorScheme={{
        primary: '#d97706',
        secondary: '#f59e0b',
        accent: '#fbbf24',
      }}
      getMetrics={(startDate, endDate) => api.sustainability.getMetrics(startDate, endDate)}
      getKPIs={(startDate, endDate) => api.sustainability.getKPIs(startDate, endDate)}
    />
  );
}

