import { Recycle } from 'lucide-react';
import { FeatureDashboard } from '../../components/sustainability/FeatureDashboard';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

export function TextReuseDashboard() {
  return (
    <FeatureDashboard
      title={t('sustainability.textReuse.title')}
      description={t('sustainability.textReuse.description')}
      icon={<Recycle className="w-8 h-8 text-green-600" />}
      featureKey="text-reuse"
      colorScheme={{
        primary: '#16a34a',
        secondary: '#22c55e',
        accent: '#4ade80',
      }}
      getMetrics={(startDate, endDate) => api.sustainability.getMetrics(startDate, endDate)}
      getKPIs={(startDate, endDate) => api.sustainability.getKPIs(startDate, endDate)}
    />
  );
}

