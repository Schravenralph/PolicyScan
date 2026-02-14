import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

interface ValidationIssue {
    type: 'error' | 'warning' | 'info';
    message: string;
    field?: string;
}

interface ValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    info: ValidationIssue[];
    entity?: {
        id: string;
        name?: string;
        level?: string;
        hierarchy?: {
            level: string;
            parentId?: string;
        };
    };
    parent?: {
        id: string;
        name?: string;
        level?: string;
    };
}

interface EntityWithHierarchy {
    id: string;
    name?: string;
    hierarchy?: {
        level?: string;
        parentId?: string;
    };
}

interface HierarchyValidatorProps {
    validation: {
        success: boolean;
        entity: EntityWithHierarchy;
        validation: ValidationResult;
        parent?: EntityWithHierarchy;
    };
}

export function HierarchyValidator({ validation }: HierarchyValidatorProps) {
    const { validation: result, entity, parent } = validation;

    const getIcon = (type: 'error' | 'warning' | 'info') => {
        switch (type) {
            case 'error':
                return <XCircle className="w-5 h-5 text-red-600" />;
            case 'warning':
                return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
            case 'info':
                return <Info className="w-5 h-5 text-blue-600" />;
        }
    };

    const getBgColor = (type: 'error' | 'warning' | 'info') => {
        switch (type) {
            case 'error':
                return 'bg-red-50 border-red-200';
            case 'warning':
                return 'bg-yellow-50 border-yellow-200';
            case 'info':
                return 'bg-blue-50 border-blue-200';
        }
    };

    const allIssues = [
        ...(result.errors || []).map((e) => ({ ...e, type: 'error' as const })),
        ...(result.warnings || []).map((w) => ({ ...w, type: 'warning' as const })),
        ...(result.info || []).map((i) => ({ ...i, type: 'info' as const })),
    ];

    return (
        <div className="space-y-4">
            {/* Validation Status */}
            <div
                className={`p-4 rounded-lg border-2 ${
                    result.valid
                        ? 'bg-green-50 border-green-200'
                        : allIssues.some((i) => i.type === 'error')
                        ? 'bg-red-50 border-red-200'
                        : 'bg-yellow-50 border-yellow-200'
                }`}
            >
                <div className="flex items-center gap-2">
                    {result.valid ? (
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : (
                        <XCircle className="w-6 h-6 text-red-600" />
                    )}
                    <h4 className="text-lg font-semibold">
                        {result.valid ? 'Hierarchy is Valid' : 'Hierarchy Validation Failed'}
                    </h4>
                </div>
            </div>

            {/* Entity Information */}
            {entity && (
                <div className="bg-gray-50 rounded-lg p-4">
                    <h5 className="font-semibold text-gray-700 mb-2">Entity Information</h5>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span className="text-gray-600">ID:</span>
                            <span className="ml-2 font-mono">{entity.id}</span>
                        </div>
                        {entity.name && (
                            <div>
                                <span className="text-gray-600">Name:</span>
                                <span className="ml-2">{entity.name}</span>
                            </div>
                        )}
                        {entity.hierarchy?.level && (
                            <div>
                                <span className="text-gray-600">Level:</span>
                                <span className="ml-2 capitalize">{entity.hierarchy.level}</span>
                            </div>
                        )}
                        {entity.hierarchy?.parentId && (
                            <div>
                                <span className="text-gray-600">Parent ID:</span>
                                <span className="ml-2 font-mono">{entity.hierarchy.parentId}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Parent Information */}
            {parent && (
                <div className="bg-gray-50 rounded-lg p-4">
                    <h5 className="font-semibold text-gray-700 mb-2">Parent Entity</h5>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span className="text-gray-600">ID:</span>
                            <span className="ml-2 font-mono">{parent.id}</span>
                        </div>
                        {parent.name && (
                            <div>
                                <span className="text-gray-600">Name:</span>
                                <span className="ml-2">{parent.name}</span>
                            </div>
                        )}
                        {parent.hierarchy?.level && (
                            <div>
                                <span className="text-gray-600">Level:</span>
                                <span className="ml-2 capitalize">{parent.hierarchy.level}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Validation Issues */}
            {allIssues.length > 0 && (
                <div className="space-y-2">
                    <h5 className="font-semibold text-gray-700">Validation Issues</h5>
                    {allIssues.map((issue, index) => (
                        <div
                            key={index}
                            className={`p-3 rounded-lg border ${getBgColor(issue.type)}`}
                        >
                            <div className="flex items-start gap-2">
                                {getIcon(issue.type)}
                                <div className="flex-1">
                                    {issue.field && (
                                        <span className="text-xs font-semibold text-gray-600 uppercase">
                                            {issue.field}:{' '}
                                        </span>
                                    )}
                                    <span className="text-sm">{issue.message}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* No Issues */}
            {allIssues.length === 0 && result.valid && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-green-800 font-medium">No validation issues found.</p>
                </div>
            )}
        </div>
    );
}
