/**
 * Zod validation schemas for SRU (Search and Retrieval via URL) responses
 * 
 * These schemas validate SRU XML responses parsed from the KOOP repository
 * to ensure type safety and catch API changes early.
 * 
 * SRU Protocol: https://www.loc.gov/standards/sru/
 * KOOP Repository: https://repository.overheid.nl/
 */

import { z } from 'zod';

/**
 * Schema for GZD (Gebruikers-Zichtbare Data) metadata
 * 
 * This represents the parsed Dublin Core elements from SRU records:
 * - dc:title -> titel
 * - dc:creator -> creator (uitgevende_instantie)
 * - dc:date -> datum_bekendmaking
 * - dc:identifier -> identifier (ELI URL)
 * - dc:type -> soort_publicatie
 * - dc:description -> description
 */
export const SruGzdMetadataSchema = z.object({
    /** Document title (dc:title) */
    titel: z.string().min(1, 'Title is required'),
    /** Document identifier/URL (dc:identifier) - typically ELI URL, but can be internal ID */
    identifier: z.string().optional(),
    /** Publication date (dc:date) */
    datum_bekendmaking: z.string().optional(),
    /** Issuing authority (dc:creator) */
    uitgevende_instantie: z.string().optional(),
    /** Publication name/type (dc:type) */
    publicatienaam: z.string().optional(),
    /** Publication type/category (dc:type) */
    soort_publicatie: z.string().optional(),
    /** Description/summary (dc:description) */
    description: z.string().optional(),
});

/**
 * Schema for a single SRU record
 * 
 * SRU records contain recordData with GZD metadata
 */
export const SruRecordSchema = z.object({
    /** Record data containing GZD metadata */
    recordData: z.object({
        /** GZD metadata block */
        gzd: SruGzdMetadataSchema,
    }),
    /** Optional record position in result set */
    recordPosition: z.number().optional(),
});

/**
 * Schema for complete SRU response
 * 
 * Handles both single record (object) and multiple records (array) formats
 */
export const SruResponseSchema = z.object({
    searchRetrieveResponse: z.object({
        /** Total number of records matching query */
        numberOfRecords: z.number().int().min(0),
        /** Records array or single record */
        records: z.object({
            /** Can be array of records or single record */
            record: z.union([
                z.array(SruRecordSchema),
                SruRecordSchema,
            ]),
        }),
    }),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type SruGzdMetadata = z.infer<typeof SruGzdMetadataSchema>;
export type SruRecord = z.infer<typeof SruRecordSchema>;
export type SruResponse = z.infer<typeof SruResponseSchema>;

/**
 * Parsed record structure (after XML parsing but before validation)
 * 
 * This represents the structure extracted from XML using Cheerio
 */
export interface ParsedSruRecord {
    title?: string;
    creator?: string;
    date?: string;
    identifier?: string;
    type?: string;
    description?: string;
    eli?: string;
}

/**
 * Validates a parsed SRU record and converts it to GZD metadata format
 * 
 * @param parsed Parsed record from XML
 * @returns Validated GZD metadata or null if validation fails
 */
export function validateParsedRecord(parsed: ParsedSruRecord): SruGzdMetadata | null {
    try {
        // Convert parsed structure to GZD format
        const gzdData = {
            titel: parsed.title || '',
            identifier: parsed.identifier || parsed.eli,
            datum_bekendmaking: parsed.date,
            uitgevende_instantie: parsed.creator,
            publicatienaam: parsed.type,
            soort_publicatie: parsed.type,
            description: parsed.description,
        };

        // Validate with schema
        return SruGzdMetadataSchema.parse(gzdData);
    } catch (error) {
        if (error instanceof z.ZodError) {
            // Log validation errors but don't throw
            return null;
        }
        throw error;
    }
}

