/**
 * Dashboard Quick Links Component
 * 
 * Quick navigation links to various test analysis pages.
 */

import { TrendingUp, Activity, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { t } from '../../utils/i18n';

export function DashboardQuickLinks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('test.quickLinksToTrendAnalysis')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/tests/trends" className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-semibold">{t('test.testTrends')}</div>
                <div className="text-sm text-gray-600 mt-1">{t('test.identifyFlakyTests')}</div>
              </div>
            </div>
          </Link>
          
          <Link to="/tests/health" className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-green-600" />
              <div>
                <div className="font-semibold">{t('test.testHealth')}</div>
                <div className="text-sm text-gray-600 mt-1">{t('test.failureTimeline')}</div>
              </div>
            </div>
          </Link>
          
          <Link to="/tests/performance" className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <Search className="w-5 h-5 text-purple-600" />
              <div>
                <div className="font-semibold">{t('common.performance')}</div>
                <div className="text-sm text-gray-600 mt-1">{t('common.performanceMetrics')}</div>
              </div>
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
