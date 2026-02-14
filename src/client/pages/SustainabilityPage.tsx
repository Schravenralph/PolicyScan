import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Leaf, Database, Search, Recycle, Zap, Cloud, TrendingDown, Server, ArrowRight } from 'lucide-react';
import { t } from '../utils/i18n';
import { SustainabilityMetricsCard } from '../components/SustainabilityMetricsCard';

export function SustainabilityPage() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Leaf className="w-8 h-8 text-green-600" />
          <h1 className="text-4xl font-bold text-gray-900">{t('sustainability.title')}</h1>
        </div>
        <p className="text-xl text-gray-600">{t('sustainability.subtitle')}</p>
      </div>

      {/* Introduction */}
      <Card className="mb-8 bg-gradient-to-br from-green-50 to-blue-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-2xl">{t('sustainability.intro.title')}</CardTitle>
          <CardDescription className="text-base">{t('sustainability.intro.description')}</CardDescription>
        </CardHeader>
      </Card>

      {/* Caching Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-6 h-6 text-blue-600" />
            <CardTitle className="text-2xl">{t('sustainability.caching.title')}</CardTitle>
          </div>
          <CardDescription className="text-base">{t('sustainability.caching.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Caching Diagram */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">{t('sustainability.caching.diagram.title')}</h3>
              <div className="flex items-center justify-center gap-8 flex-wrap">
                {/* Without Caching */}
                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium text-gray-600 mb-2">{t('sustainability.caching.diagram.without')}</div>
                  <svg width="200" height="180" className="border border-gray-300 rounded bg-white">
                    {/* User */}
                    <circle cx="100" cy="30" r="15" fill="#3b82f6" />
                    <text x="100" y="35" textAnchor="middle" fill="#374151" fontSize="12">👤</text>
                    
                    {/* Button */}
                    <rect x="70" y="50" width="60" height="25" rx="4" fill="#10b981" />
                    <text x="100" y="66" textAnchor="middle" fill="white" fontSize="10" fontWeight="500">{t('sustainability.caching.diagram.button')}</text>
                    
                    {/* Arrow down */}
                    <line x1="100" y1="75" x2="100" y2="90" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrow-red)" />
                    
                    {/* Server */}
                    <rect x="60" y="90" width="80" height="40" rx="4" fill="#f59e0b" />
                    <text x="100" y="110" textAnchor="middle" fill="white" fontSize="10" fontWeight="500">{t('sustainability.caching.diagram.server')}</text>
                    <text x="100" y="125" textAnchor="middle" fill="white" fontSize="10">{t('sustainability.caching.diagram.processing')}</text>
                    
                    {/* Arrow down */}
                    <line x1="100" y1="130" x2="100" y2="145" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrow-red)" />
                    
                    {/* AI */}
                    <rect x="60" y="145" width="80" height="30" rx="4" fill="#8b5cf6" />
                    <text x="100" y="165" textAnchor="middle" fill="white" fontSize="10" fontWeight="500">{t('sustainability.caching.diagram.aiProcessing')}</text>
                    
                    {/* Arrow markers */}
                    <defs>
                      <marker id="arrow-red" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
                        <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
                      </marker>
                    </defs>
                  </svg>
                  <div className="text-xs text-gray-500 mt-2 text-center max-w-[200px]">
                    {t('sustainability.caching.diagram.withoutDesc')}
                  </div>
                </div>

                {/* Arrow between */}
                <div className="text-2xl text-gray-400">→</div>

                {/* With Caching */}
                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium text-gray-600 mb-2">{t('sustainability.caching.diagram.with')}</div>
                  <svg width="200" height="180" className="border border-gray-300 rounded bg-white">
                    {/* User */}
                    <circle cx="100" cy="30" r="15" fill="#3b82f6" />
                    <text x="100" y="35" textAnchor="middle" fill="#374151" fontSize="12">👤</text>
                    
                    {/* Button */}
                    <rect x="70" y="50" width="60" height="25" rx="4" fill="#10b981" />
                    <text x="100" y="66" textAnchor="middle" fill="white" fontSize="10" fontWeight="500">{t('sustainability.caching.diagram.button')}</text>
                    
                    {/* Arrow to cache */}
                    <line x1="100" y1="75" x2="100" y2="100" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrow-green)" />
                    
                    {/* Cache */}
                    <rect x="60" y="100" width="80" height="50" rx="4" fill="#10b981" />
                    <text x="100" y="120" textAnchor="middle" fill="white" fontSize="10" fontWeight="500">💾 Cache</text>
                    <text x="100" y="135" textAnchor="middle" fill="white" fontSize="10">{t('sustainability.caching.diagram.instantResult')}</text>
                    <text x="100" y="150" textAnchor="middle" fill="white" fontSize="10">{t('sustainability.caching.diagram.noAiNeeded')}</text>
                    
                    {/* Arrow markers */}
                    <defs>
                      <marker id="arrow-green" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
                        <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
                      </marker>
                    </defs>
                  </svg>
                  <div className="text-xs text-gray-500 mt-2 text-center max-w-[200px]">
                    {t('sustainability.caching.diagram.withDesc')}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <p className="text-gray-700">{t('sustainability.caching.benefit')}</p>
            </div>
            
            <div className="flex justify-end pt-4">
              <Button 
                onClick={() => navigate('/sustainability/caching')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Bekijk Metrics Dashboard
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Single AI Search vs Multiple Google Queries */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <Search className="w-6 h-6 text-purple-600" />
            <CardTitle className="text-2xl">{t('sustainability.singleSearch.title')}</CardTitle>
          </div>
          <CardDescription className="text-base">{t('sustainability.singleSearch.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Comparison Diagram */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">{t('sustainability.singleSearch.diagram.title')}</h3>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Multiple Google Queries */}
                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium text-red-600 mb-3">{t('sustainability.singleSearch.diagram.multiple')}</div>
                  <svg width="280" height="240" className="border border-red-300 rounded bg-white">
                    {/* User */}
                    <circle cx="140" cy="30" r="15" fill="#3b82f6" />
                    <text x="140" y="35" textAnchor="middle" fill="#374151" fontSize="12">👤</text>
                    
                    {/* 15 Google queries */}
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i, idx) => {
                      const x = 20 + (idx % 5) * 52;
                      const y = 60 + Math.floor(idx / 5) * 35;
                      return (
                        <g key={i}>
                          <rect x={x} y={y} width="45" height="25" rx="3" fill="#ef4444" opacity="0.7" />
                          <text x={x + 22.5} y={y + 16} textAnchor="middle" fill="white" fontSize="8">Google</text>
                          <line x1={x + 22.5} y1={y + 25} x2={140} y2={45} stroke="#ef4444" strokeWidth="1" opacity="0.3" />
                        </g>
                      );
                    })}
                    
                    {/* Energy indicator */}
                    <rect x="60" y="200" width="160" height="30" rx="4" fill="#ef4444" opacity="0.2" />
                    <text x="140" y="220" textAnchor="middle" fill="#b91c1c" fontSize="11" fontWeight="bold">{t('sustainability.singleSearch.diagram.highEnergyUsage')}</text>
                    
                    {/* Arrow markers */}
                    <defs>
                      <marker id="arrow-red-thin" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                        <polygon points="0 0, 6 3, 0 6" fill="#ef4444" />
                      </marker>
                    </defs>
                  </svg>
                  <div className="text-xs text-gray-500 mt-2 text-center max-w-[280px]">
                    {t('sustainability.singleSearch.diagram.multipleDesc')}
                  </div>
                </div>

                {/* Single AI Search */}
                <div className="flex flex-col items-center">
                  <div className="text-sm font-medium text-green-600 mb-3">{t('sustainability.singleSearch.diagram.single')}</div>
                  <svg width="280" height="240" className="border border-green-300 rounded bg-white">
                    {/* User */}
                    <circle cx="140" cy="30" r="15" fill="#3b82f6" />
                    <text x="140" y="35" textAnchor="middle" fill="#374151" fontSize="12">👤</text>
                    
                    {/* Single AI query */}
                    <rect x="90" y="60" width="100" height="40" rx="4" fill="#10b981" />
                    <text x="140" y="80" textAnchor="middle" fill="white" fontSize="10" fontWeight="500">{t('sustainability.singleSearch.diagram.aiSearch')}</text>
                    <text x="140" y="95" textAnchor="middle" fill="white" fontSize="10">{t('sustainability.singleSearch.diagram.once')}</text>
                    
                    {/* Arrow down */}
                    <line x1="140" y1="100" x2="140" y2="130" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-green-thick)" />
                    
                    {/* Result */}
                    <rect x="60" y="130" width="160" height="50" rx="4" fill="#8b5cf6" />
                    <text x="140" y="150" textAnchor="middle" fill="white" fontSize="10" fontWeight="500">{t('sustainability.singleSearch.diagram.comprehensive')}</text>
                    <text x="140" y="165" textAnchor="middle" fill="white" fontSize="10">{t('sustainability.singleSearch.diagram.results')}</text>
                    <text x="140" y="180" textAnchor="middle" fill="white" fontSize="10">{t('sustainability.singleSearch.diagram.allInOne')}</text>
                    
                    {/* Energy indicator */}
                    <rect x="60" y="200" width="160" height="30" rx="4" fill="#10b981" opacity="0.2" />
                    <text x="140" y="220" textAnchor="middle" fill="#15803d" fontSize="11" fontWeight="bold">{t('sustainability.singleSearch.diagram.lowEnergyUsage')}</text>
                    
                    {/* Arrow markers */}
                    <defs>
                      <marker id="arrow-green-thick" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
                        <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
                      </marker>
                    </defs>
                  </svg>
                  <div className="text-xs text-gray-500 mt-2 text-center max-w-[280px]">
                    {t('sustainability.singleSearch.diagram.singleDesc')}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded">
              <p className="text-gray-700">{t('sustainability.singleSearch.benefit')}</p>
            </div>
            
            <div className="flex justify-end pt-4">
              <Button 
                onClick={() => navigate('/sustainability/single-search')}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Bekijk Metrics Dashboard
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Text Reuse Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <Recycle className="w-6 h-6 text-green-600" />
            <CardTitle className="text-2xl">{t('sustainability.textReuse.title')}</CardTitle>
          </div>
          <CardDescription className="text-base">{t('sustainability.textReuse.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Text Reuse Diagram */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">{t('sustainability.textReuse.diagram.title')}</h3>
              <svg width="100%" height="300" viewBox="0 0 800 300" className="border border-gray-300 rounded bg-white">
                {/* First use - AI generates */}
                <g>
                  <rect x="50" y="50" width="120" height="60" rx="4" fill="#8b5cf6" />
                  <text x="110" y="75" textAnchor="middle" fill="white" fontSize="13" fontWeight="500">AI Generates</text>
                  <text x="110" y="95" textAnchor="middle" fill="white" fontSize="11">Text Content</text>
                  
                  {/* Arrow to storage */}
                  <line x1="170" y1="80" x2="250" y2="80" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-storage)" />
                  
                  {/* Storage */}
                  <rect x="250" y="50" width="120" height="60" rx="4" fill="#10b981" />
                  <text x="310" y="75" textAnchor="middle" fill="white" fontSize="13" fontWeight="500">💾 Saved</text>
                  <text x="310" y="95" textAnchor="middle" fill="white" fontSize="11">In Database</text>
                  
                  {/* Arrow to reuse */}
                  <line x1="370" y1="80" x2="450" y2="80" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-reuse)" />
                  
                  {/* Reuse */}
                  <rect x="450" y="50" width="120" height="60" rx="4" fill="#3b82f6" />
                  <text x="510" y="75" textAnchor="middle" fill="white" fontSize="13" fontWeight="500">♻️ Reused</text>
                  <text x="510" y="95" textAnchor="middle" fill="white" fontSize="11">No New AI Call</text>
                </g>
                
                {/* Second use - from cache */}
                <g>
                  <rect x="50" y="180" width="120" height="60" rx="4" fill="#f59e0b" />
                  <text x="110" y="205" textAnchor="middle" fill="white" fontSize="13" fontWeight="500">User Request</text>
                  <text x="110" y="225" textAnchor="middle" fill="white" fontSize="11">Same Content</text>
                  
                  {/* Arrow to storage (skip AI) */}
                  <line x1="170" y1="210" x2="250" y2="210" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-storage)" />
                  
                  {/* Storage (same) */}
                  <rect x="250" y="180" width="120" height="60" rx="4" fill="#10b981" />
                  <text x="310" y="205" textAnchor="middle" fill="white" fontSize="13" fontWeight="500">💾 Retrieved</text>
                  <text x="310" y="225" textAnchor="middle" fill="white" fontSize="11">From Cache</text>
                  
                  {/* Arrow to result */}
                  <line x1="370" y1="210" x2="450" y2="210" stroke="#10b981" strokeWidth="3" markerEnd="url(#arrow-reuse)" />
                  
                  {/* Result */}
                  <rect x="450" y="180" width="120" height="60" rx="4" fill="#10b981" />
                  <text x="510" y="205" textAnchor="middle" fill="white" fontSize="13" fontWeight="500">✅ Result</text>
                  <text x="510" y="225" textAnchor="middle" fill="white" fontSize="11">No Carbon Cost!</text>
                </g>
                
                {/* Comparison text */}
                <text x="400" y="280" textAnchor="middle" fill="#4b5563" fontSize="13" fontWeight="500">
                  {t('sustainability.textReuse.diagram.comparison')}
                </text>
                
                {/* Arrow markers */}
                <defs>
                  <marker id="arrow-storage" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
                  </marker>
                  <marker id="arrow-reuse" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
                  </marker>
                </defs>
              </svg>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-gray-900">{t('sustainability.textReuse.cost.title')}</h4>
                </div>
                <p className="text-gray-700 text-sm">{t('sustainability.textReuse.cost.description')}</p>
              </div>
              
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-900">{t('sustainability.textReuse.carbon.title')}</h4>
                </div>
                <p className="text-gray-700 text-sm">{t('sustainability.textReuse.carbon.description')}</p>
              </div>
            </div>
            
            <div className="flex justify-end pt-4">
              <Button 
                onClick={() => navigate('/sustainability/text-reuse')}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Bekijk Metrics Dashboard
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Practices Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <Server className="w-6 h-6 text-indigo-600" />
            <CardTitle className="text-2xl">{t('sustainability.additional.title')}</CardTitle>
          </div>
          <CardDescription className="text-base">{t('sustainability.additional.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-indigo-600" />
                <h4 className="font-semibold text-gray-900">{t('sustainability.additional.efficient.title')}</h4>
              </div>
              <p className="text-gray-700 text-sm mb-3">{t('sustainability.additional.efficient.description')}</p>
              <Button 
                onClick={() => navigate('/sustainability/efficient-algorithms')}
                variant="outline"
                size="sm"
                className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-100"
              >
                Bekijk Metrics
                <ArrowRight className="ml-2 w-3 h-3" />
              </Button>
            </div>
            
            <div className="bg-teal-50 border-l-4 border-teal-500 p-4 rounded">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-teal-600" />
                <h4 className="font-semibold text-gray-900">{t('sustainability.additional.data.title')}</h4>
              </div>
              <p className="text-gray-700 text-sm mb-3">{t('sustainability.additional.data.description')}</p>
              <Button 
                onClick={() => navigate('/sustainability/data-storage')}
                variant="outline"
                size="sm"
                className="w-full border-teal-300 text-teal-700 hover:bg-teal-100"
              >
                Bekijk Metrics
                <ArrowRight className="ml-2 w-3 h-3" />
              </Button>
            </div>
            
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-amber-600" />
                <h4 className="font-semibold text-gray-900">{t('sustainability.additional.optimization.title')}</h4>
              </div>
              <p className="text-gray-700 text-sm mb-3">{t('sustainability.additional.optimization.description')}</p>
              <Button 
                onClick={() => navigate('/sustainability/server-optimization')}
                variant="outline"
                size="sm"
                className="w-full border-amber-300 text-amber-700 hover:bg-amber-100"
              >
                Bekijk Metrics
                <ArrowRight className="ml-2 w-3 h-3" />
              </Button>
            </div>
            
            <div className="bg-cyan-50 border-l-4 border-cyan-500 p-4 rounded">
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="w-5 h-5 text-cyan-600" />
                <h4 className="font-semibold text-gray-900">{t('sustainability.additional.scalable.title')}</h4>
              </div>
              <p className="text-gray-700 text-sm mb-3">{t('sustainability.additional.scalable.description')}</p>
              <Button 
                onClick={() => navigate('/sustainability/scalable-architecture')}
                variant="outline"
                size="sm"
                className="w-full border-cyan-300 text-cyan-700 hover:bg-cyan-100"
              >
                Bekijk Metrics
                <ArrowRight className="ml-2 w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Impact Metrics Section */}
      <SustainabilityMetricsCard />

      {/* Summary */}
      <Card className="bg-gradient-to-br from-green-50 to-blue-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-2xl">{t('sustainability.summary.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-green-600 font-bold text-xl">✓</span>
              <span className="text-gray-700">{t('sustainability.summary.point1')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-600 font-bold text-xl">✓</span>
              <span className="text-gray-700">{t('sustainability.summary.point2')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-600 font-bold text-xl">✓</span>
              <span className="text-gray-700">{t('sustainability.summary.point3')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-600 font-bold text-xl">✓</span>
              <span className="text-gray-700">{t('sustainability.summary.point4')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-green-600 font-bold text-xl">✓</span>
              <span className="text-gray-700">{t('sustainability.summary.point5')}</span>
            </li>
          </ul>
          <div className="mt-6 p-4 bg-white rounded-lg border border-green-200">
            <p className="text-gray-700 text-sm">{t('sustainability.summary.commitment')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

