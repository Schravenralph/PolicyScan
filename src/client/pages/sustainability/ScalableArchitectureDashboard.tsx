import { Cloud } from 'lucide-react';
import { FeatureDashboard } from '../../components/sustainability/FeatureDashboard';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

export function ScalableArchitectureDashboard() {
  return (
    <FeatureDashboard
      title={t('sustainability.additional.scalable.title')}
      description={t('sustainability.additional.scalable.description')}
      icon={<Cloud className="w-8 h-8 text-cyan-600" />}
      featureKey="scalable-architecture"
      colorScheme={{
        primary: '#0891b2',
        secondary: '#06b6d4',
        accent: '#22d3ee',
      }}
      getMetrics={(startDate, endDate) => api.sustainability.getMetrics(startDate, endDate)}
      getKPIs={(startDate, endDate) => api.sustainability.getKPIs(startDate, endDate)}
    />
  );
}

