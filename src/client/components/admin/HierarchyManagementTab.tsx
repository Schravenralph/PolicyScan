import { useState, useEffect, useCallback } from 'react';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { HierarchyTree, HierarchyTreeNode } from '../HierarchyTree';
import { Loader2, Search, AlertCircle, CheckCircle2, Edit2, Save, X } from 'lucide-react';
import { HierarchyLevel } from '../../../shared/types';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';

const levelLabels: Record<HierarchyLevel, string> = {
    municipality: 'Gemeente',
    province: 'Provincie',
    national: 'Nationaal',
    european: 'Europees',
};

interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    cycles?: string[][];
    bidirectionalIssues?: Array<{ entityId: string; issue: string }>;
}

interface HierarchyEntity {
    id: string;
    name: string;
    level: HierarchyLevel;
    parentId?: string;
    childrenIds?: string[];
    validation?: ValidationResult;
}

export function HierarchyManagementTab() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLevel, setSelectedLevel] = useState<HierarchyLevel | 'all'>('all');
    const [rootNodeId, setRootNodeId] = useState<string | undefined>(undefined);
    const [jurisdictions, setJurisdictions] = useState<HierarchyEntity[]>([]);
    const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(false);
    const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>('');
    const [validationResults, setValidationResults] = useState<Map<string, ValidationResult>>(new Map());
    const [isValidating, setIsValidating] = useState(false);
    const [editingEntity, setEditingEntity] = useState<string | null>(null);
    const [editParentId, setEditParentId] = useState<string>('');
    const [editLevel, setEditLevel] = useState<HierarchyLevel>('municipality');

    const loadJurisdictions = useCallback(async () => {
        setIsLoadingJurisdictions(true);
        try {
            const levels: HierarchyLevel[] = ['municipality', 'province', 'national', 'european'];
            const allJurisdictions: HierarchyEntity[] = [];

            for (const level of levels) {
                if (selectedLevel === 'all' || selectedLevel === level) {
                    try {
                        const response = await api.getHierarchyByLevel(level);
                        if (response.regulations && Array.isArray(response.regulations)) {
                            const levelJurisdictions = (response.regulations as Array<{ id: string; name?: string; jurisdiction?: string; hierarchy?: { level?: HierarchyLevel; parentId?: string; childrenIds?: string[] } }>).map((doc) => ({
                                id: doc.id,
                                name: doc.name || doc.jurisdiction || doc.id,
                                level: doc.hierarchy?.level || level,
                                parentId: doc.hierarchy?.parentId,
                                childrenIds: doc.hierarchy?.childrenIds || [],
                            }));
                            allJurisdictions.push(...levelJurisdictions);
                        }
                    } catch (error) {
                        logError(error, `load-${level}-jurisdictions`);
                        // GraphDB errors are handled silently - they don't prevent loading other levels
                    }
                }
            }

            setJurisdictions(allJurisdictions);
        } catch (error) {
            logError(error, 'load-jurisdictions');
        } finally {
            setIsLoadingJurisdictions(false);
        }
    }, [selectedLevel]);

    useEffect(() => {
        loadJurisdictions();
    }, [loadJurisdictions]);

    const handleNodeClick = (node: HierarchyTreeNode) => {
        setRootNodeId(node.id);
        setSelectedJurisdiction(node.id);
        setEditingEntity(null);
    };

    const handleValidateHierarchy = async (entityId: string) => {
        setIsValidating(true);
        try {
            const response = await api.validateHierarchy(entityId, true);
            const validation: ValidationResult = {
                valid: response.validation.valid || false,
                errors: response.validation.errors || [],
                warnings: response.validation.warnings || [],
                cycles: response.validation.hasCycles ? [] : undefined,
                bidirectionalIssues: response.validation.bidirectionalConsistency === false ? [] : undefined,
            };
            setValidationResults(prev => new Map(prev).set(entityId, validation));
        } catch (error) {
            logError(error, 'validate-hierarchy');
            const validation: ValidationResult = {
                valid: false,
                errors: ['Failed to validate hierarchy'],
                warnings: [],
            };
            setValidationResults(prev => new Map(prev).set(entityId, validation));
        } finally {
            setIsValidating(false);
        }
    };

    const handleEditHierarchy = (entity: HierarchyEntity) => {
        setEditingEntity(entity.id);
        setEditParentId(entity.parentId || '');
        setEditLevel(entity.level);
    };

    const handleSaveHierarchy = async (entityId: string) => {
        try {
            await api.updateHierarchy(entityId, {
                level: editLevel,
                parentId: editParentId || undefined,
            });
            setEditingEntity(null);
            await loadJurisdictions();
            if (rootNodeId === entityId) {
                // Reload tree if editing root node
                setRootNodeId(undefined);
                setTimeout(() => setRootNodeId(entityId), 100);
            }
        } catch (error) {
            logError(error, 'update-hierarchy');
            alert('Failed to update hierarchy. Please try again.');
        }
    };

    const handleCancelEdit = () => {
        setEditingEntity(null);
        setEditParentId('');
    };

    const handleSearch = () => {
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

    const selectedEntity = jurisdictions.find(j => j.id === selectedJurisdiction);
    const validation = selectedEntity ? validationResults.get(selectedEntity.id) : undefined;

    return (
        <div className="space-y-6">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Jurisdiction List */}
                <Card className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Jurisdicties</h2>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {filteredJurisdictions.map((jurisdiction) => (
                            <div
                                key={jurisdiction.id}
                                className={`p-3 rounded border cursor-pointer transition-colors ${
                                    selectedJurisdiction === jurisdiction.id
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                                onClick={() => {
                                    setRootNodeId(jurisdiction.id);
                                    setSelectedJurisdiction(jurisdiction.id);
                                    setEditingEntity(null);
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <Badge>{levelLabels[jurisdiction.level]}</Badge>
                                        <span className="truncate font-medium">{jurisdiction.name}</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditHierarchy(jurisdiction);
                                        }}
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {filteredJurisdictions.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">
                                Geen jurisdicties gevonden
                            </p>
                        )}
                    </div>
                </Card>

                {/* Right Column: Hierarchy Tree and Validation */}
                <div className="space-y-4">
                    {/* Hierarchy Tree */}
                    {rootNodeId && (
                        <Card className="p-4">
                            <h2 className="text-lg font-semibold mb-4">Hiërarchie Structuur</h2>
                            <HierarchyTree
                                rootNodeId={rootNodeId}
                                onNodeClick={handleNodeClick}
                                showDocuments={false}
                            />
                        </Card>
                    )}

                    {/* Validation Dashboard */}
                    {selectedEntity && (
                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">Validatie Status</h2>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleValidateHierarchy(selectedEntity.id)}
                                    disabled={isValidating}
                                >
                                    {isValidating ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Valideren...
                                        </>
                                    ) : (
                                        'Valideer'
                                    )}
                                </Button>
                            </div>

                            {validation && (
                                <div className="space-y-4">
                                    {/* Validation Status */}
                                    <div className="flex items-center gap-2">
                                        {validation.valid ? (
                                            <>
                                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                                <span className="text-green-700 font-medium">Geldig</span>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle className="h-5 w-5 text-red-500" />
                                                <span className="text-red-700 font-medium">Ongeldig</span>
                                            </>
                                        )}
                                    </div>

                                    {/* Errors */}
                                    {validation.errors.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-red-700 mb-2">Fouten</h3>
                                            <ul className="list-disc list-inside space-y-1 text-sm text-red-600">
                                                {validation.errors.map((error, idx) => (
                                                    <li key={idx}>{error}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Warnings */}
                                    {validation.warnings.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-yellow-700 mb-2">Waarschuwingen</h3>
                                            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-600">
                                                {validation.warnings.map((warning, idx) => (
                                                    <li key={idx}>{warning}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Cycles */}
                                    {validation.cycles && validation.cycles.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-red-700 mb-2">Cycli Gedetecteerd</h3>
                                            <ul className="list-disc list-inside space-y-1 text-sm text-red-600">
                                                {validation.cycles.map((cycle, idx) => (
                                                    <li key={idx}>{cycle.join(' → ')}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Bidirectional Issues */}
                                    {validation.bidirectionalIssues && validation.bidirectionalIssues.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-yellow-700 mb-2">Bidirectionele Consistentie</h3>
                                            <ul className="list-disc list-inside space-y-1 text-sm text-yellow-600">
                                                {validation.bidirectionalIssues.map((issue, idx) => (
                                                    <li key={idx}>{issue.entityId}: {issue.issue}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!validation && (
                                <p className="text-muted-foreground text-sm">
                                    Klik op "Valideer" om de hiërarchie te controleren
                                </p>
                            )}
                        </Card>
                    )}

                    {!rootNodeId && (
                        <Card className="p-8 text-center">
                            <p className="text-muted-foreground">
                                Selecteer een jurisdictie om de hiërarchie te bekijken en te beheren
                            </p>
                        </Card>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {editingEntity && selectedEntity && (
                <Card className="p-4 border-2 border-blue-500">
                    <h3 className="text-lg font-semibold mb-4">Hiërarchie Bewerken</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Entiteit</label>
                            <Input value={selectedEntity.name} disabled />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Niveau</label>
                            <Select value={editLevel} onValueChange={(value) => setEditLevel(value as HierarchyLevel)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="municipality">Gemeente</SelectItem>
                                    <SelectItem value="province">Provincie</SelectItem>
                                    <SelectItem value="national">Nationaal</SelectItem>
                                    <SelectItem value="european">Europees</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Ouder ID (optioneel)</label>
                            <Input
                                value={editParentId}
                                onChange={(e) => setEditParentId(e.target.value)}
                                placeholder="Laat leeg voor geen ouder"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => handleSaveHierarchy(editingEntity)}>
                                <Save className="mr-2 h-4 w-4" />
                                Opslaan
                            </Button>
                            <Button variant="outline" onClick={handleCancelEdit}>
                                <X className="mr-2 h-4 w-4" />
                                Annuleren
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}

