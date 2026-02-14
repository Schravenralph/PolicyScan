import { Link, useLocation } from 'react-router-dom';
import { Database, Play, History, Network, FileText, LogOut, User, Search, Globe, Settings, HelpCircle, BarChart3, Leaf, TestTube, Flag, AlignLeft } from 'lucide-react';
import { Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { t } from '../utils/i18n';
import { OnboardingTour } from './OnboardingTour';
import { PageLoader } from './ui/PageLoader';

interface LayoutProps {
    children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
    const location = useLocation();
    const { user, logout } = useAuth();

    // Base navigation for all users
    const baseNavigation = [
        { name: 'Beleidsscan', href: '/beleidsscan', icon: FileText, priority: 1 },
        { name: t('layout.beleidsscanSettings'), href: '/beleidsscan/configuration', icon: Settings, priority: 1.5 },
        { name: t('layout.scanHistory'), href: '/runs', icon: History, priority: 2 },
        { name: 'Zoeken', href: '/search', icon: Search, priority: 3 },
        { name: 'Samenvatter', href: '/samenvatter', icon: AlignLeft, priority: 3.5 },
        { name: 'Kennis Netwerk', href: '/knowledge', icon: Database, priority: 4 },
        { name: t('layout.commonCrawl'), href: '/commoncrawl', icon: Globe, priority: 5 },
        { name: t('graphPage.navigationNetwork'), href: '/graph', icon: Network, priority: 6 },
        { name: t('sustainability.title'), href: '/sustainability', icon: Leaf, priority: 6.5 },
        { name: 'Help', href: '/help', icon: HelpCircle, priority: 7 },
    ];

    // Developer/admin only navigation items
    const developerNavigation = [
        { name: 'Workflows', href: '/workflows', icon: Play, priority: 2.5 },
        { name: 'Benchmarking', href: '/benchmark', icon: BarChart3, priority: 2.6 },
        { name: 'Test Dashboard', href: '/tests', icon: TestTube, priority: 2.7 },
    ];

    // Admin only navigation items
    const adminNavigation = [
        { name: t('layout.featureFlags'), href: '/feature-flags', icon: Flag, priority: 9 },
        { name: t('layout.flagTemplates'), href: '/feature-flags/templates', icon: Flag, priority: 9.1 },
        { name: t('layout.systemAdministration'), href: '/admin', icon: Settings, priority: 10 },
    ];

    // Build navigation based on user role
    const navigation = [...baseNavigation];
    if (user?.role === 'developer' || user?.role === 'admin') {
        navigation.push(...developerNavigation);
    }
    if (user?.role === 'admin') {
        navigation.push(...adminNavigation);
    }

    // Sort by priority
    navigation.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    return (
        <div className="min-h-screen flex bg-gray-50">
            {/* Skip to main content link for keyboard users */}
            <a 
                href="#main-content" 
                className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-3 focus:bg-blue-600 focus:text-white focus:rounded-br focus:font-medium focus:shadow-lg"
                aria-label="Skip to main content"
            >
                Skip to main content
            </a>
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-6 border-b border-gray-200">
                    <Link to="/" className="flex items-center gap-2 text-xl font-bold">
                        <Database className="h-6 w-6" />
                        Beleidsscan
                    </Link>
                </div>

                <nav className="flex-1 p-4 space-y-1" aria-label="Main navigation">
                    {navigation.map((item) => {
                        const isActive = location.pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isActive
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-700' : 'text-gray-400'}`} aria-hidden="true" />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                {/* User menu */}
                <div className="p-4 border-t border-gray-200">
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg mb-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 rounded-lg hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                        aria-label={`${t('layout.logout')} (${user?.name || 'User'})`}
                    >
                        <LogOut className="w-5 h-5" aria-hidden="true" />
                        {t('layout.logout')}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <main id="main-content" className="flex-1 overflow-auto" role="main">
                <Suspense fallback={<PageLoader />}>
                    {children}
                </Suspense>
            </main>
            <OnboardingTour />
        </div>
    );
}
