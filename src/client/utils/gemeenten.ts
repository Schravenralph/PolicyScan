/**
 * Utility module for loading and parsing gemeenten CSV data
 * This module can be easily mocked in tests
 */

import gemeentenCsv from '../../../gemeentes-en-cbs.csv?raw';

const dutchCollator = new Intl.Collator('nl', { sensitivity: 'base', numeric: true });

export const sortByDutch = (values: string[]): string[] =>
    [...values].sort((a, b) => dutchCollator.compare(a, b));

export const parseMunicipalitiesCsv = (csvText: string): string[] => {
    const rows = csvText.trim().split(/\r?\n/).slice(1);
    const uniqueNames = new Set<string>();

    rows.forEach((row) => {
        if (!row.trim()) return;
        const cells = row.split(',');
        const name = cells.slice(1).join(',').trim().replace(/^"|"$/g, '');
        if (name) {
            uniqueNames.add(name);
        }
    });

    return sortByDutch(Array.from(uniqueNames));
};

// Lazy load CSV parsing to reduce memory pressure during esbuild transformation
// This prevents parsing from happening at module load time, which can cause
// esbuild service crashes (EPIPE errors) when memory is constrained
let gemeentenCache: string[] | null = null;

export const getGemeenten = (): string[] => {
    if (gemeentenCache === null) {
        gemeentenCache = parseMunicipalitiesCsv(gemeentenCsv);
    }
    return gemeentenCache;
};

// Export for testing purposes - allows resetting cache
export const resetGemeentenCache = (): void => {
    gemeentenCache = null;
};
