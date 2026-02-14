import { z } from 'zod';
import {
    BaseEntity,
    EntityType,
    PolicyDocument,
    Regulation,
    SpatialUnit,
    LandUse,
    Requirement,
    isValidSchemaOrgUri
} from '../../../domain/ontology.js';

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

export interface ValidationWarning {
    field: string;
    message: string;
    code: string;
}

/**
 * Validates entities against the ontology schema.
 * Ensures all required fields are present and type-specific constraints are met.
 */
export class EntitySchemaValidator {
    // Base entity schema
	    private baseEntitySchema = z.object({
        id: z
            .string()
            .min(1, 'ID is required')
            .regex(/^[a-zA-Z0-9_-]+$/, 'ID must be alphanumeric with hyphens/underscores'),
        type: z.enum(['SpatialUnit', 'LandUse', 'Regulation', 'PolicyDocument', 'Requirement', 'Concept']),
        name: z.string().min(1, 'Name is required').max(500, 'Name too long'),
        description: z.string().max(5000, 'Description too long').optional(),
	        uri: z.string().url('Invalid URI format').optional(),
	        schemaType: z.string().max(100).optional(),
	        metadata: z.record(z.string(), z.any()).optional(),
	    });

    // Type-specific schemas
    private policyDocumentSchema = this.baseEntitySchema.extend({
        type: z.literal('PolicyDocument'),
        documentType: z.enum(['Structure', 'Vision', 'Ordinance', 'Note']),
        jurisdiction: z.string().min(1, 'Jurisdiction is required'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be ISO format (YYYY-MM-DD)'),
        status: z.enum(['Draft', 'Active', 'Archived']),
        url: z.string().url('Invalid URL format').optional(),
    });

    private regulationSchema = this.baseEntitySchema.extend({
        type: z.literal('Regulation'),
        category: z.enum(['Zoning', 'Environmental', 'Building', 'Procedural']),
    });

    private spatialUnitSchema = this.baseEntitySchema.extend({
        type: z.literal('SpatialUnit'),
        spatialType: z.enum(['Parcel', 'Building', 'Street', 'Neighborhood', 'ZoningArea']),
        geometry: z.any().optional(), // GeoJSON validation can be added later
    });

    private landUseSchema = this.baseEntitySchema.extend({
        type: z.literal('LandUse'),
        category: z.string().min(1, 'Category is required'),
    });

    private requirementSchema = this.baseEntitySchema.extend({
        type: z.literal('Requirement'),
        metric: z.string().min(1, 'Metric is required'),
        operator: z.enum(['<', '<=', '>', '>=', '=', 'between']),
        value: z.union([z.number(), z.string()]),
        unit: z.string().optional(),
    });

    /**
     * Validate an entity against the appropriate schema
     */
    validate(entity: BaseEntity): ValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        try {
            let schema;
            switch (entity.type) {
                case 'PolicyDocument':
                    schema = this.policyDocumentSchema;
                    break;
                case 'Regulation':
                    schema = this.regulationSchema;
                    break;
                case 'SpatialUnit':
                    schema = this.spatialUnitSchema;
                    break;
                case 'LandUse':
                    schema = this.landUseSchema;
                    break;
                case 'Requirement':
                    schema = this.requirementSchema;
                    break;
                default:
                    schema = this.baseEntitySchema;
            }

            schema.parse(entity);
        } catch (error) {
            if (error instanceof z.ZodError) {
                const issues: z.ZodIssue[] = ('issues' in error ? error.issues : (error as any).errors) as z.ZodIssue[];
                errors.push(
                    ...issues.map((e: z.ZodIssue) => ({
                        field: e.path.join('.'),
                        message: e.message,
                        code: e.code,
                    }))
                );
            } else {
                errors.push({
                    field: 'unknown',
                    message: 'Unexpected validation error',
                    code: 'UNKNOWN_ERROR',
                });
            }
        }

        // Additional custom validations
        this.validateUri(entity, warnings);
        this.validateMetadata(entity, warnings);

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Validate URI format and schema.org compliance
     */
    private validateUri(entity: BaseEntity, warnings: ValidationWarning[]): void {
        if (entity.uri) {
            // Check if URI follows schema.org pattern
            if (!entity.uri.includes('schema.org')) {
                warnings.push({
                    field: 'uri',
                    message: 'URI does not appear to be schema.org compliant',
                    code: 'NON_SCHEMA_ORG_URI',
                });
            }

            // Validate schema.org format if present
            if (entity.uri.includes('schema.org') && !isValidSchemaOrgUri(entity.uri)) {
                warnings.push({
                    field: 'uri',
                    message: 'URI format may not be fully schema.org compliant',
                    code: 'INVALID_SCHEMA_ORG_FORMAT',
                });
            }
        }
    }

    /**
     * Validate metadata structure and content
     */
    private validateMetadata(entity: BaseEntity, warnings: ValidationWarning[]): void {
        if (entity.metadata) {
            // Check for large metadata objects
            const metadataSize = JSON.stringify(entity.metadata).length;
            if (metadataSize > 10000) {
                warnings.push({
                    field: 'metadata',
                    message: 'Metadata is very large (>10KB), consider normalizing',
                    code: 'LARGE_METADATA',
                });
            }

            // Check for suspicious patterns (e.g., potential injection)
            const metadataStr = JSON.stringify(entity.metadata);
            if (metadataStr.includes('<script') || metadataStr.includes('javascript:')) {
                warnings.push({
                    field: 'metadata',
                    message: 'Metadata contains potentially unsafe content',
                    code: 'UNSAFE_METADATA',
                });
            }
        }
    }
}
