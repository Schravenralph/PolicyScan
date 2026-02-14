import { Database } from 'lucide-react';
import { FeatureDashboard } from '../../components/sustainability/FeatureDashboard';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

export function CachingDashboard() {
  return (
    <FeatureDashboard
      title={t('sustainability.caching.title')}
      description={t('sustainability.caching.description')}
      icon={<Database className="w-8 h-8 text-blue-600" />}
      featureKey="caching"
      colorScheme={{
        primary: '#2563eb',
        secondary: '#3b82f6',
        accent: '#60a5fa',
      }}
      getMetrics={(startDate, endDate) => api.sustainability.getMetrics(startDate, endDate)}
      getKPIs={(startDate, endDate) => api.sustainability.getKPIs(startDate, endDate)}
    />
  );
}

