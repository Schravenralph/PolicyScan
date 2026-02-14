import { Neo4jNVLVisualizer } from '../components/Neo4jNVLVisualizer';
import { Database, BookOpen, ChevronRight, Brain, Settings, AlertCircle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '../utils/apiUrl';
import { Dialog, DialogContent, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { GraphRAGQuery } from '../components/knowledge/GraphRAGQuery';
import { t } from '../utils/i18n';
import { api } from '../services/api';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';

export function KnowledgePage() {
    const [backend, setBackend] = useState<'graphdb' | 'neo4j' | null>(null);
    const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
    
    // Fetch backend info from API
    useEffect(() => {
        const fetchBackend = async () => {
            try {
                const response = await fetch(`${getApiBaseUrl()}/knowledge-graph/meta?strategy=hybrid&minClusterSize=1&groupByDomain=true`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.backend) {
                        setBackend(data.backend);
                    }
                }
            } catch (error) {
                // Silently fail - backend will remain null and we'll show generic text
                console.debug('Could not fetch backend info:', error);
            }
        };
        fetchBackend();
    }, []);

    // Fetch feature flags
    useEffect(() => {
        const fetchFlags = async () => {
            try {
                const flags = await api.workflowConfiguration.getAvailableFeatureFlags();
                const flagsMap: Record<string, boolean> = {};
                flags.forEach(flag => {
                    flagsMap[flag.name] = flag.currentValue;
                });
                setFeatureFlags(flagsMap);
            } catch (error) {
                console.warn('Failed to fetch feature flags:', error);
            }
        };
        fetchFlags();
    }, []);
    
    const getVisualizationText = () => {
        if (backend === 'graphdb') {
            return t('knowledgePage.visualizationDescription.graphdb');
        } else if (backend === 'neo4j') {
            return t('knowledgePage.visualizationDescription.neo4j');
        } else {
            return t('knowledgePage.visualizationDescription.generic');
        }
    };

    const isKgDisabled = 'KG_ENABLED' in featureFlags && !featureFlags['KG_ENABLED'];
    
    return (
        <div className="container mx-auto p-6 max-w-6xl h-full flex flex-col">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <Database className="h-8 w-8 text-blue-600" />
                    {t('knowledgePage.title')}
                </h1>
                <div className="flex items-center justify-between">
                    <p className="text-muted-foreground">
                        {getVisualizationText()}
                    </p>
                    <div className="flex items-center gap-4">
                        <Link to="/knowledge-graph/management">
                            <Button variant="outline" className="gap-2">
                                <Settings className="w-4 h-4" />
                                {t('knowledgePage.manageKg')}
                            </Button>
                        </Link>
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="gap-2">
                                    <Brain className="w-4 h-4" />
                                    {t('knowledgePage.graphRAGSearch')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                                <GraphRAGQuery />
                            </DialogContent>
                        </Dialog>
                        <Link
                            to="/help/tutorial/knowledge-network"
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1 whitespace-nowrap"
                        >
                            <BookOpen className="w-4 h-4" />
                            {t('knowledgePage.deepDiveTutorial')}
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Warnings */}
            {isKgDisabled && (
                <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t('knowledgePage.kgDisabled')}</AlertTitle>
                    <AlertDescription>
                        {t('knowledgePage.kgDisabledDescription')}
                    </AlertDescription>
                </Alert>
            )}

            {featureFlags['KG_WORKFLOW_INTEGRATION_ENABLED'] === false && !isKgDisabled && (
                <Alert className="mb-4 bg-yellow-50 border-yellow-200 text-yellow-800">
                    <Info className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800">{t('knowledgePage.workflowIntegrationDisabled')}</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                        {t('knowledgePage.workflowIntegrationDisabledDescription')}
                    </AlertDescription>
                </Alert>
            )}

            {!isKgDisabled && (
                <div className="flex-1 min-h-[600px] bg-white rounded-lg shadow-sm border border-gray-200">
                    <Neo4jNVLVisualizer />
                </div>
            )}
        </div>
    );
}
