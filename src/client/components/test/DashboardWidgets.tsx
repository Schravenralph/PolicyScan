/**
 * Dashboard Widgets Component
 * 
 * Provides compact widgets for displaying recommendations, alerts, and dependencies
 * on the main test dashboard.
 */

import { useEffect, useState, useCallback } from 'react';
import { TestApiService } from '../../services/api/TestApiService';
import { Lightbulb, Bell, ArrowRight, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Link } from 'react-router-dom';

interface DashboardWidgetsProps {
  testApiService?: TestApiService;
  compact?: boolean;
}

export function DashboardWidgets({ testApiService: injectedTestApiService, compact = false }: DashboardWidgetsProps) {
  const testApi = injectedTestApiService || new TestApiService();

  const [recommendations, setRecommendations] = useState<{
    total: number;
    critical: number;
    high: number;
  } | null>(null);
  const [alerts, setAlerts] = useState<{
    total: number;
    critical: number;
    high: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissedWidgets, setDismissedWidgets] = useState<Set<string>>(new Set());

  const loadWidgetData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load recommendations summary
      try {
        const recs = await testApi.getTestRecommendations({
          timeRangeDays: 30,
          includeCoverage: true,
          includeFlakiness: true,
          includePerformance: true,
        });
        setRecommendations({
          total: (recs.summary as { total: number }).total,
          critical: ((recs.summary as { byPriority?: { critical?: number } })?.byPriority?.critical) || 0,
          high: ((recs.summary as { byPriority?: { high?: number } })?.byPriority?.high) || 0,
        });
      } catch (error) {
        console.debug('Failed to load recommendations:', error);
      }

      // Load alerts summary
      try {
        const alertsData = await testApi.getTestAlerts({
          timeRangeDays: 7,
        });
        setAlerts({
          total: (alertsData.summary as { total: number }).total,
          critical: ((alertsData.summary as { bySeverity?: { critical?: number } })?.bySeverity?.critical) || 0,
          high: ((alertsData.summary as { bySeverity?: { high?: number } })?.bySeverity?.high) || 0,
        });
      } catch (error) {
        console.debug('Failed to load alerts:', error);
      }
    } catch (error) {
      console.error('Error loading widget data:', error);
    } finally {
      setLoading(false);
    }
  }, [testApi]);

  useEffect(() => {
    loadWidgetData();
    // Refresh every 5 minutes
    const interval = setInterval(loadWidgetData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadWidgetData]);

  const dismissWidget = useCallback((widgetId: string) => {
    setDismissedWidgets(prev => new Set([...Array.from(prev), widgetId]));
  }, []);

  if (loading && !recommendations && !alerts) {
    return null;
  }

  const widgets = [];

  // Recommendations Widget
  if (recommendations && !dismissedWidgets.has('recommendations') && recommendations.total > 0) {
    widgets.push(
      <Card key="recommendations" className="border-l-4 border-l-blue-500">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-lg">Recommendations</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {recommendations.critical > 0 && (
                <Badge className="bg-red-100 text-red-800">Critical: {recommendations.critical}</Badge>
              )}
              {recommendations.high > 0 && (
                <Badge className="bg-orange-100 text-orange-800">High: {recommendations.high}</Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissWidget('recommendations')}
                className="h-6 w-6 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {recommendations.total} actionable recommendation{recommendations.total !== 1 ? 's' : ''} available
          </p>
          <Link to="/tests/recommendations">
            <Button variant="outline" size="sm" className="w-full">
              View Recommendations
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Alerts Widget
  if (alerts && !dismissedWidgets.has('alerts') && alerts.total > 0) {
    widgets.push(
      <Card key="alerts" className={`border-l-4 ${
        alerts.critical > 0 ? 'border-l-red-500' :
        alerts.high > 0 ? 'border-l-orange-500' :
        'border-l-yellow-500'
      }`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className={`w-5 h-5 ${
                alerts.critical > 0 ? 'text-red-600' :
                alerts.high > 0 ? 'text-orange-600' :
                'text-yellow-600'
              }`} />
              <CardTitle className="text-lg">Active Alerts</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {alerts.critical > 0 && (
                <Badge className="bg-red-100 text-red-800">Critical: {alerts.critical}</Badge>
              )}
              {alerts.high > 0 && (
                <Badge className="bg-orange-100 text-orange-800">High: {alerts.high}</Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissWidget('alerts')}
                className="h-6 w-6 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {alerts.total} active alert{alerts.total !== 1 ? 's' : ''} requiring attention
          </p>
          <Link to="/tests/alerts">
            <Button variant="outline" size="sm" className="w-full">
              View Alerts
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (widgets.length === 0) {
    return null;
  }

  return (
    <div className={`grid grid-cols-1 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4 mb-6`}>
      {widgets}
    </div>
  );
}

