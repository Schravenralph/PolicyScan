import { useState, useMemo } from 'react';
import { Search, BookOpen, FileText, Play, Database, Globe, HelpCircle, ChevronRight } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  tutorial?: boolean;
  targetUser: 'advisor' | 'tester' | 'admin';
}

const helpArticles: HelpArticle[] = [
  {
    id: 'getting-started',
    title: 'Aan de slag met Beleidsscan',
    category: 'Getting Started',
    content: 'Welkom bij Beleidsscan! Deze gids helpt je om snel aan de slag te gaan. Beleidsscan is een platform voor het zoeken en analyseren van beleidsdocumenten van Nederlandse overheden.',
    tags: ['onboarding', 'basics'],
    tutorial: true,
    targetUser: 'advisor',
  },
  {
    id: 'how-to-search',
    title: 'Hoe voer ik een zoekopdracht uit?',
    category: 'Search',
    content: 'Gebruik de zoekpagina om te zoeken naar beleidsdocumenten. Je kunt zoeken op onderwerp, locatie, en jurisdictieniveau. Probeer bijvoorbeeld: "arbeidsmigranten in Horst aan de Maas".',
    tags: ['search', 'tutorial'],
    tutorial: true,
    targetUser: 'advisor',
  },
  {
    id: 'search-filters',
    title: 'Zoekfilters gebruiken',
    category: 'Search',
    content: 'Gebruik filters om je zoekresultaten te verfijnen. Filter op jurisdictieniveau (Rijk, Provincie, Gemeente), publicatiedatum, of bron. Je kunt meerdere filters combineren.',
    tags: ['search', 'filters'],
    targetUser: 'advisor',
  },
  {
    id: 'workflows-intro',
    title: 'Wat zijn Workflows?',
    category: 'Workflows',
    content: 'Workflows zijn geautomatiseerde processen voor het scrapen en analyseren van websites. Als developer kun je workflows maken om regelmatig websites te monitoren en nieuwe documenten te vinden.',
    tags: ['workflows', 'developer'],
    targetUser: 'admin',
  },
  {
    id: 'workflow-basics',
    title: 'Een Workflow maken',
    category: 'Workflows',
    content: 'Maak een nieuwe workflow door naar de Workflows pagina te gaan. Kies een website, configureer de scraping parameters, en stel een planning in. De workflow zal automatisch nieuwe documenten vinden.',
    tags: ['workflows', 'tutorial'],
    tutorial: true,
    targetUser: 'admin',
  },
  {
    id: 'knowledge-network',
    title: 'Kennis Netwerk begrijpen',
    category: 'Knowledge Network',
    content: 'Het Kennis Netwerk toont de relaties tussen documenten, concepten en entiteiten. Gebruik het om te navigeren tussen gerelateerde documenten en om patronen te ontdekken.',
    tags: ['knowledge', 'graph'],
    tutorial: true,
    targetUser: 'advisor',
  },
  {
    id: 'common-crawl',
    title: 'Common Crawl gebruiken',
    category: 'Common Crawl',
    content: 'Common Crawl biedt toegang tot een grote dataset van gescrapede websites. Gebruik het om te zoeken in historische data en om trends te analyseren.',
    tags: ['common-crawl', 'data'],
    targetUser: 'tester',
  },
  {
    id: 'scan-history',
    title: 'Scan Geschiedenis bekijken',
    category: 'Scan History',
    content: 'Bekijk je scan geschiedenis op de Runs pagina. Hier zie je alle uitgevoerde scans, hun status, en resultaten. Je kunt ook oude scans opnieuw bekijken.',
    tags: ['history', 'runs'],
    targetUser: 'advisor',
  },
];

const categories = [
  { id: 'all', name: 'Alle categorieën', icon: BookOpen },
  { id: 'Getting Started', name: 'Aan de slag', icon: HelpCircle },
  { id: 'Search', name: 'Zoeken', icon: Search },
  { id: 'Workflows', name: 'Workflows', icon: Play },
  { id: 'Knowledge Network', name: 'Kennis Netwerk', icon: Database },
  { id: 'Common Crawl', name: 'Common Crawl', icon: Globe },
  { id: 'Scan History', name: 'Scan Geschiedenis', icon: FileText },
];

// Helper function to check if an article should be visible to the current user
function isArticleVisible(article: HelpArticle, userRole?: string): boolean {
  // Admins see everything
  if (userRole === 'admin') {
    return true;
  }

  // Map targetUser to roles
  const roleMapping: Record<string, string[]> = {
    'advisor': ['advisor', 'client'],
    'tester': ['developer'],
    'admin': ['admin', 'developer'],
  };

  const allowedRoles = roleMapping[article.targetUser] || [];
  return userRole ? allowedRoles.includes(userRole) : false;
}

export function HelpCenter() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredArticles = useMemo(() => {
    let filtered = helpArticles;

    // Filter by target user role (admins see everything)
    filtered = filtered.filter(article => isArticleVisible(article, user?.role));

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(article => article.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(query) ||
        article.content.toLowerCase().includes(query) ||
        article.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [searchQuery, selectedCategory, user?.role]);

  const groupedArticles = useMemo(() => {
    const grouped: Record<string, HelpArticle[]> = {};
    filteredArticles.forEach(article => {
      if (!grouped[article.category]) {
        grouped[article.category] = [];
      }
      grouped[article.category].push(article);
    });
    return grouped;
  }, [filteredArticles]);

  // Get all visible articles (before category/search filtering) to determine visible categories
  const visibleArticles = useMemo(() => {
    return helpArticles.filter(article => isArticleVisible(article, user?.role));
  }, [user?.role]);

  const visibleCategories = useMemo(() => {
    const categorySet = new Set(visibleArticles.map(article => article.category));
    return categories.filter(cat => cat.id === 'all' || categorySet.has(cat.id));
  }, [visibleArticles]);

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Help Center</h1>
        <p className="text-gray-600">Vind antwoorden op je vragen en leer hoe je Beleidsscan het beste gebruikt.</p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Zoek in help artikelen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="mb-8">
        <div className="flex flex-wrap gap-2">
          {visibleCategories.map(category => {
              const Icon = category.icon;
              const isActive = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{category.name}</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Articles */}
      {filteredArticles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Geen artikelen gevonden. Probeer een andere zoekterm.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedArticles).map(([category, articles]) => (
            <div key={category}>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{category}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {articles.map(article => (
                  <Card key={article.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{article.title}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {article.targetUser}
                          </Badge>
                          {article.tutorial && (
                            <Badge variant="secondary" className="ml-2">
                              Tutorial
                            </Badge>
                          )}
                        </div>
                      </div>
                      <CardDescription className="mt-2">{article.content}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {article.tags.map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        {article.tutorial && (
                          <Link
                            to={`/help/tutorial/${article.id}`}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                          >
                            Start tutorial
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <div className="mt-12 pt-8 border-t border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Snelle links</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link
            to="/search"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Search className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-gray-900">Zoekpagina</p>
              <p className="text-sm text-gray-600">Begin met zoeken</p>
            </div>
          </Link>
          {user?.role === 'developer' || user?.role === 'admin' ? (
            <Link
              to="/workflows"
              className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Play className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">Workflows</p>
                <p className="text-sm text-gray-600">Beheer workflows</p>
              </div>
            </Link>
          ) : null}
          <Link
            to="/runs"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-gray-900">Scan Geschiedenis</p>
              <p className="text-sm text-gray-600">Bekijk eerdere scans</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

