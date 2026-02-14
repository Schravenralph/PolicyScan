import { Database } from 'lucide-react';
import { FeatureDashboard } from '../../components/sustainability/FeatureDashboard';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

export function DataStorageDashboard() {
  return (
    <FeatureDashboard
      title={t('sustainability.additional.data.title')}
      description={t('sustainability.additional.data.description')}
      icon={<Database className="w-8 h-8 text-teal-600" />}
      featureKey="data-storage"
      colorScheme={{
        primary: '#0d9488',
        secondary: '#14b8a6',
        accent: '#2dd4bf',
      }}
      getMetrics={(startDate, endDate) => api.sustainability.getMetrics(startDate, endDate)}
      getKPIs={(startDate, endDate) => api.sustainability.getKPIs(startDate, endDate)}
    />
  );
}

