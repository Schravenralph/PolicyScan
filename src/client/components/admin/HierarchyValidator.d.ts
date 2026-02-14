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
export declare function HierarchyValidator({ validation }: HierarchyValidatorProps): import("react/jsx-runtime").JSX.Element;
export {};
