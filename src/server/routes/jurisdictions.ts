import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

const router = Router();

let cachedMunicipalities: string[] | null = null;
let cachedSignature: string | null = null;

/**
 * Read and parse CSV file
 */
function parseMunicipalitiesCsv(csvText: string): string[] {
    const rows = csvText.trim().split(/\r?\n/).slice(1);
    const uniqueNames = new Set<string>();

    rows.forEach((row) => {
        if (!row.trim()) {
            return;
        }

        // Improved CSV parsing that handles quoted fields with commas
        // Match quoted strings or unquoted values
        const csvRegex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
        const cells: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = csvRegex.exec(row)) !== null) {
            // Use quoted value if available, otherwise use unquoted value
            const value = match[1] ? match[1].replace(/""/g, '"') : (match[2] || '');
            cells.push(value.trim());
        }

        // Skip first column (index), take rest as municipality name
        if (cells.length > 1) {
            const name = cells.slice(1).join(',').trim();
            if (name) {
                uniqueNames.add(name);
            }
        }
    });

    // Sort using Dutch collation
    const dutchCollator = new Intl.Collator('nl', { sensitivity: 'base', numeric: true });
    return Array.from(uniqueNames).sort((a, b) => dutchCollator.compare(a, b));
}

/**
 * Generate signature for data integrity validation
 */
function generateSignature(data: string): string {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const secret = process.env.JURISDICTIONS_SECRET || 
        (nodeEnv === 'production' ? undefined : 'dev-jurisdictions-secret-change-in-production');

    if (!secret) {
        logger.error('JURISDICTIONS_SECRET environment variable is not set. Data integrity checks will fail.');
        throw new ServiceUnavailableError('Server configuration error: JURISDICTIONS_SECRET is missing');
    }

    return createHash('sha256')
        .update(data + secret)
        .digest('hex');
}

interface JurisdictionsData {
    municipalities: string[];
    signature: string;
}

async function getJurisdictionsData(): Promise<JurisdictionsData> {
    if (cachedMunicipalities && cachedSignature) {
        return { municipalities: cachedMunicipalities, signature: cachedSignature };
    }

    try {
        // Read CSV file from project root
        const csvPath = join(process.cwd(), 'gemeentes-en-cbs.csv');
        const csvContent = await fs.readFile(csvPath, 'utf-8');

        // Parse municipalities
        const municipalities = parseMunicipalitiesCsv(csvContent);

        if (municipalities.length === 0) {
            logger.warn({ csvPath }, 'CSV file parsed but no municipalities found');
            throw new ServiceUnavailableError(
                'No municipalities found in CSV file',
                { csvPath }
            );
        }

        // Generate signature for data integrity
        const dataString = JSON.stringify(municipalities);
        const signature = generateSignature(dataString);

        cachedMunicipalities = municipalities;
        cachedSignature = signature;

        logger.debug(
            { municipalityCount: municipalities.length },
            'Loaded jurisdictions from CSV'
        );

        return { municipalities, signature };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
            { error, errorMessage, cwd: process.cwd() },
            'Failed to load jurisdictions data'
        );

        // If it's already a ServiceUnavailableError, rethrow it
        if (error instanceof ServiceUnavailableError) {
            throw error;
        }

        // If file doesn't exist or can't be read
        if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
            throw new ServiceUnavailableError(
                'Jurisdictions CSV file not found. Please ensure gemeentes-en-cbs.csv exists in the project root.',
                { error: errorMessage }
            );
        }

        // For other errors, wrap in ServiceUnavailableError
        throw new ServiceUnavailableError(
            `Failed to load jurisdictions data: ${errorMessage}`,
            { error: errorMessage }
        );
    }
}

export function resetCache(): void {
    cachedMunicipalities = null;
    cachedSignature = null;
}

// Get jurisdictions data
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    const { municipalities, signature } = await getJurisdictionsData();

    // Return data with signature
    res.json({
        municipalities,
        waterschappen: [
            "Waterschap Hunze en Aa's",
            'Wetterskip Fryslân',
            'Waterschap Drents Overijsselse Delta',
            'Waterschap Vechtstromen',
            'Waterschap Rijn en IJssel',
            'Waterschap Vallei en Veluwe',
            'Waterschap Rivierenland',
            'Waterschap Aa en Maas',
            'Waterschap De Dommel',
            'Waterschap Limburg',
            'Waterschap Brabantse Delta',
            'Waterschap Scheldestromen',
            'Waterschap Hollandse Delta',
            'Hoogheemraadschap van Delfland',
            'Hoogheemraadschap van Schieland en de Krimpenerwaard',
            'Hoogheemraadschap van Rijnland',
            'Hoogheemraadschap Hollands Noorderkwartier',
            'Waterschap Amstel, Gooi en Vecht',
            'Hoogheemraadschap De Stichtse Rijnlanden',
            'Waterschap Zuiderzeeland',
        ],
        provincies: [
            'Drenthe',
            'Flevoland',
            'Friesland',
            'Gelderland',
            'Groningen',
            'Limburg',
            'Noord-Brabant',
            'Noord-Holland',
            'Overijssel',
            'Utrecht',
            'Zeeland',
            'Zuid-Holland',
        ].sort((a, b) => new Intl.Collator('nl', { sensitivity: 'base', numeric: true }).compare(a, b)),
        signature,
        timestamp: new Date().toISOString(),
    });
}));

// Verify signature endpoint (for client-side validation)
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
    const { data, signature } = req.body;

    if (!data || !signature) {
        throw new BadRequestError('Missing data or signature', {
            received: { data: !!data, signature: !!signature }
        });
    }

    const expectedSignature = generateSignature(JSON.stringify(data));
    const isValid = signature === expectedSignature;

    res.json({ valid: isValid });
}));

export default router;
