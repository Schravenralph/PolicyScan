import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Database, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { api } from '../services/api';
import { t } from '../utils/i18n';

interface BloomConnectionStatus {
    available: boolean;
    url?: string;
    error?: string;
}

/**
 * Neo4j Bloom Visualizer Component
 * Integrates Neo4j Bloom for native graph visualization with proper depth and organic layouts
 */
export function Neo4jBloomVisualizer() {
    const [bloomStatus, setBloomStatus] = useState<BloomConnectionStatus>({ available: false });
    const [isChecking, setIsChecking] = useState(true);
    const [bloomUrl, setBloomUrl] = useState<string>('');

    /**
     * Get default Bloom URL based on Neo4j URI
     */
    const getDefaultBloomUrl = useCallback((): string => {
        // Check environment variable first
        const envBloomUrl = import.meta.env.VITE_NEO4J_BLOOM_URL;
        if (envBloomUrl) {
            return envBloomUrl;
        }
        
        // Bloom installation options:
        // 1. As plugin: http://host:7474/bloom/
        // 2. Via Neo4j Browser: http://host:7474/browser/ (if Bloom is enabled)
        // 3. Standalone: bloom.neo4j.io (with connectURL parameter)
        
        const neo4jUri = import.meta.env.VITE_NEO4J_URI || 'bolt://localhost:7687';
        
        // Extract host from bolt URI
        const match = neo4jUri.match(/bolt:\/\/([^:]+)/);
        const host = match ? match[1] : 'localhost';
        
        // Try Bloom plugin endpoint first (most common installation)
        // Fallback to Browser endpoint
        return `http://${host}:7474/bloom/`;
    }, []);

    /**
     * Check if Neo4j Bloom is available
     */
    const checkBloomAvailability = useCallback(async () => {
        setIsChecking(true);
        try {
            // Use API service instead of direct fetch
            const data = await api.graph.getBloomStatus();
            setBloomStatus({
                available: data.available,
                url: data.url,
                error: data.error
            });
            if (data.url) {
                setBloomUrl(data.url);
            }
        } catch {
            // Fallback to default URL
            const defaultUrl = getDefaultBloomUrl();
            setBloomStatus({
                available: false,
                url: defaultUrl,
                error: 'Could not check Bloom availability'
            });
            setBloomUrl(defaultUrl);
        } finally {
            setIsChecking(false);
        }
    }, [getDefaultBloomUrl]);

    useEffect(() => {
        void checkBloomAvailability();
    }, [checkBloomAvailability]);

    /**
     * Open Bloom in new window
     */
    const openBloomInNewWindow = () => {
        if (bloomUrl) {
            window.open(bloomUrl, '_blank', 'noopener,noreferrer');
        }
    };

    if (isChecking) {
        return (
            <div className="flex items-center justify-center h-full min-h-[600px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-gray-600">{t('neo4jBloom.checkingAvailability')}</p>
                </div>
            </div>
        );
    }

    // If Bloom is available, show embedded iframe or link
    if (bloomStatus.available && bloomUrl) {
        return (
            <div className="w-full h-full min-h-[600px] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                            <h3 className="font-semibold text-gray-900">{t('neo4jBloom.title')}</h3>
                            <p className="text-sm text-gray-600">{t('neo4jBloom.description')}</p>
                        </div>
                    </div>
                    <Button
                        onClick={openBloomInNewWindow}
                        variant="outline"
                        className="flex items-center gap-2"
                    >
                        <ExternalLink className="h-4 w-4" />
                        {t('neo4jBloom.openInNewWindow')}
                    </Button>
                </div>
                <div className="flex-1 relative">
                    <iframe
                        src={bloomUrl}
                        className="w-full h-full border-0"
                        title={t('neo4jBloom.title')}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                    />
                </div>
            </div>
        );
    }

    // Bloom not available - show setup instructions
    return (
        <div className="flex items-center justify-center h-full min-h-[600px] p-8">
            <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg border border-gray-200 p-8">
                <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 bg-yellow-100 rounded-lg">
                        <AlertCircle className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('neo4jBloom.notAvailable')}</h3>
                        <p className="text-gray-600 mb-4">
                            {t('neo4jBloom.notAvailableDescription')}
                        </p>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        {t('neo4jBloom.setupInstructions')}
                    </h4>
                    <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>
                            <strong>{t('neo4jBloom.installTitle')}</strong>
                            <ul className="list-disc list-inside ml-6 mt-1 text-sm text-gray-600">
                                <li>{t('neo4jBloom.installRequires')}</li>
                                <li>{t('neo4jBloom.installDownload')}</li>
                                <li>{t('neo4jBloom.installGuide')}</li>
                            </ul>
                        </li>
                        <li>
                            <strong>{t('neo4jBloom.configureTitle')}</strong>
                            <ul className="list-disc list-inside ml-6 mt-1 text-sm text-gray-600">
                                <li>{t('neo4jBloom.configureEnv')}</li>
                                <li>{t('neo4jBloom.configureApi')}</li>
                            </ul>
                        </li>
                        <li>
                            <strong>{t('neo4jBloom.accessTitle')}</strong>
                            <ul className="list-disc list-inside ml-6 mt-1 text-sm text-gray-600">
                                <li>{t('neo4jBloom.accessPort')}</li>
                                <li>{t('neo4jBloom.accessDefault')}</li>
                            </ul>
                        </li>
                    </ol>
                </div>

                {bloomUrl && (
                    <div className="flex gap-3">
                        <Button
                            onClick={openBloomInNewWindow}
                            className="flex items-center gap-2"
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t('neo4jBloom.tryOpening')}
                        </Button>
                        <Button
                            onClick={checkBloomAvailability}
                            variant="outline"
                        >
                            {t('neo4jBloom.recheckAvailability')}
                        </Button>
                    </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                        <strong>{t('neo4jBloom.note')}</strong> {t('neo4jBloom.noteDescription')}
                    </p>
                </div>
            </div>
        </div>
    );
}
