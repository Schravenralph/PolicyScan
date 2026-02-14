import { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { HierarchyTree, HierarchyTreeNode } from '../components/HierarchyTree';
import { Loader2, Search, AlertCircle } from 'lucide-react';
import { HierarchyLevel } from '../../shared/types';
import { api } from '../services/api';
import { logError, isGraphDBHierarchyError, parseError } from '../utils/errorHandler';

const levelLabels: Record<HierarchyLevel, string> = {
    municipality: 'Gemeente',
    province: 'Provincie',
    national: 'Nationaal',
    european: 'Europees',
};

export function HierarchyExplorer() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLevel, setSelectedLevel] = useState<HierarchyLevel | 'all'>('all');
    const [rootNodeId, setRootNodeId] = useState<string | undefined>(undefined);
    const [jurisdictions, setJurisdictions] = useState<Array<{ id: string; name: string; level: HierarchyLevel }>>([]);
    const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(false);
    const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>('');
    const [hierarchyError, setHierarchyError] = useState<string | null>(null);

    const loadJurisdictions = useCallback(async () => {
        setIsLoadingJurisdictions(true);
        setHierarchyError(null);
        try {
            const levels: HierarchyLevel[] = ['municipality', 'province', 'national', 'european'];
            const allJurisdictions: Array<{ id: string; name: string; level: HierarchyLevel }> = [];
            let hasGraphDBError = false;

            for (const level of levels) {
                if (selectedLevel === 'all' || selectedLevel === level) {
                    try {
                        const data = await api.hierarchy.getHierarchyByLevel(level);
                        const regulations = (data.regulations || []) as Array<{ id: string; name?: string; jurisdiction?: string; hierarchy?: { level?: string } }>;
                        const levelJurisdictions = regulations.map((doc) => ({
                            id: doc.id,
                            name: doc.name || doc.jurisdiction || doc.id,
                            level: (doc.hierarchy?.level || level) as HierarchyLevel,
                        }));
                        allJurisdictions.push(...levelJurisdictions);
                    } catch (error) {
                        logError(error, `load-${level}-jurisdictions`);
                        if (isGraphDBHierarchyError(error)) {
                            hasGraphDBError = true;
                            const errorInfo = parseError(error);
                            setHierarchyError(errorInfo.message);
                        }
                    }
                }
            }

            setJurisdictions(allJurisdictions);
        } catch (error) {
            logError(error, 'load-jurisdictions');
            if (isGraphDBHierarchyError(error)) {
                const errorInfo = parseError(error);
                setHierarchyError(errorInfo.message);
            }
        } finally {
            setIsLoadingJurisdictions(false);
        }
    }, [selectedLevel]);

    useEffect(() => {
        // Load jurisdictions at different levels when component mounts
        loadJurisdictions();
    }, [selectedLevel, loadJurisdictions]);

    const handleNodeClick = (node: HierarchyTreeNode) => {
        setRootNodeId(node.id);
        setSelectedJurisdiction(node.id);
    };

    const handleDocumentClick = (documentId: string) => {
        // Navigate to document or open in new tab
        window.open(`/api/knowledge-graph/entity/${documentId}`, '_blank');
    };

    const handleSearch = () => {
        // Filter jurisdictions by search query
        const filtered = jurisdictions.filter((j) =>
            j.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (filtered.length > 0) {
            setRootNodeId(filtered[0].id);
            setSelectedJurisdiction(filtered[0].id);
        }
    };

    const filteredJurisdictions = jurisdictions.filter((j) => {
        const matchesSearch = !searchQuery || j.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLevel = selectedLevel === 'all' || j.level === selectedLevel;
        return matchesSearch && matchesLevel;
    });

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Hierarchie Verkenner</h1>
                    <p className="text-muted-foreground mt-2">
                        Verken de hiërarchische structuur van beleidsdocumenten en jurisdicties
                    </p>
                </div>
            </div>

            {/* Error Message */}
            {hierarchyError && (
                <Card className="p-4 border-yellow-200 bg-yellow-50">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <h3 className="font-semibold text-yellow-800 mb-1">Hiërarchische structuur niet beschikbaar</h3>
                            <p className="text-sm text-yellow-700">{hierarchyError}</p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Search and Filter Controls */}
            <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                            <Input
                                placeholder="Zoek jurisdictie..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleSearch();
                                    }
                                }}
                                className="pl-10"
                            />
                        </div>
                    </div>
                    <Select
                        value={selectedLevel}
                        onValueChange={(value) => setSelectedLevel(value as HierarchyLevel | 'all')}
                    >
                        <SelectTrigger className="w-full md:w-[200px]">
                            <SelectValue placeholder="Filter op niveau" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle Niveaus</SelectItem>
                            <SelectItem value="municipality">Gemeente</SelectItem>
                            <SelectItem value="province">Provincie</SelectItem>
                            <SelectItem value="national">Nationaal</SelectItem>
                            <SelectItem value="european">Europees</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={handleSearch} disabled={isLoadingJurisdictions}>
                        {isLoadingJurisdictions ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Laden...
                            </>
                        ) : (
                            <>
                                <Search className="mr-2 h-4 w-4" />
                                Zoeken
                            </>
                        )}
                    </Button>
                </div>
            </Card>

            {/* Jurisdiction List */}
            {filteredJurisdictions.length > 0 && (
                <Card className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Beschikbare Jurisdicties</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                        {filteredJurisdictions.map((jurisdiction) => (
                            <Button
                                key={jurisdiction.id}
                                variant={selectedJurisdiction === jurisdiction.id ? 'default' : 'outline'}
                                className="justify-start"
                                onClick={() => {
                                    setRootNodeId(jurisdiction.id);
                                    setSelectedJurisdiction(jurisdiction.id);
                                }}
                            >
                                <Badge className="mr-2">{levelLabels[jurisdiction.level]}</Badge>
                                <span className="truncate">{jurisdiction.name}</span>
                            </Button>
                        ))}
                    </div>
                </Card>
            )}

            {/* Hierarchy Tree */}
            {rootNodeId && (
                <Card className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Hiërarchie Structuur</h2>
                    <HierarchyTree
                        rootNodeId={rootNodeId}
                        onNodeClick={handleNodeClick}
                        onDocumentClick={handleDocumentClick}
                        showDocuments={true}
                    />
                </Card>
            )}

            {!rootNodeId && !isLoadingJurisdictions && (
                <Card className="p-8 text-center">
                    <p className="text-muted-foreground">
                        Selecteer een jurisdictie om de hiërarchie te bekijken
                    </p>
                </Card>
            )}
        </div>
    );
}












