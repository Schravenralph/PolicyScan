import { Link, useLocation } from 'react-router-dom';
import { Zap, BookOpen, FileCheck, LayoutDashboard, AlertTriangle, Lightbulb, Bell, Network, Settings, Calendar, History, Target, Bug, Search, TrendingUp } from 'lucide-react';
import { t } from '../../utils/i18n';

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function TestDashboardNav() {
  const location = useLocation();
  const currentPath = location.pathname;

  const navLinks: NavLink[] = [
    { href: '/tests', label: t('testDashboardNav.dashboard'), icon: LayoutDashboard },
    { href: '/tests/analytics', label: t('testDashboardNav.analytics'), icon: TrendingUp },
    { href: '/tests/history', label: t('testDashboardNav.history'), icon: History },
    { href: '/tests/performance', label: t('testDashboardNav.performance'), icon: Zap },
    { href: '/tests/failures', label: t('testDashboardNav.failures'), icon: Bug },
    { href: '/tests/coverage', label: t('testDashboardNav.coverage'), icon: Target },
    { href: '/tests/search', label: t('testDashboardNav.search'), icon: Search },
    { href: '/tests/recommendations', label: t('testDashboardNav.recommendations'), icon: Lightbulb },
    { href: '/tests/alerts', label: t('testDashboardNav.alerts'), icon: Bell },
    { href: '/tests/dependencies', label: t('testDashboardNav.dependencies'), icon: Network },
    { href: '/tests/notifications', label: t('testDashboardNav.notifications'), icon: Settings },
    { href: '/tests/scheduled-exports', label: t('testDashboardNav.scheduledExports'), icon: Calendar },
    { href: '/tests/documentation', label: t('testDashboardNav.documentation'), icon: BookOpen },
    { href: '/tests/reports', label: t('testDashboardNav.reports'), icon: FileCheck },
    { href: '/tests/errors', label: t('testDashboardNav.errorAnalysis'), icon: AlertTriangle },
  ];

  return (
    <nav className="bg-card rounded-lg shadow-sm p-4 mb-6 border border-border" data-testid="test-dashboard-nav">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          {t('testDashboardNav.title')}
        </h2>
        <div className="flex gap-2 flex-wrap">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = currentPath === link.href || 
              (link.href === '/tests' && currentPath.startsWith('/tests') && currentPath === '/tests');
            
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

