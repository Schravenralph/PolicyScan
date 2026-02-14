import { Search } from 'lucide-react';
import { FeatureDashboard } from '../../components/sustainability/FeatureDashboard';
import { api } from '../../services/api';
import { t } from '../../utils/i18n';

export function SingleSearchDashboard() {
  return (
    <FeatureDashboard
      title={t('sustainability.singleSearch.title')}
      description={t('sustainability.singleSearch.description')}
      icon={<Search className="w-8 h-8 text-purple-600" />}
      featureKey="single-search"
      colorScheme={{
        primary: '#9333ea',
        secondary: '#a855f7',
        accent: '#c084fc',
      }}
      getMetrics={(startDate, endDate) => api.sustainability.getMetrics(startDate, endDate)}
      getKPIs={(startDate, endDate) => api.sustainability.getKPIs(startDate, endDate)}
    />
  );
}

