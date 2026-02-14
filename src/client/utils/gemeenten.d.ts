/**
 * Utility module for loading and parsing gemeenten CSV data
 * This module can be easily mocked in tests
 */
export declare const sortByDutch: (values: string[]) => string[];
export declare const parseMunicipalitiesCsv: (csvText: string) => string[];
export declare const getGemeenten: () => string[];
export declare const resetGemeentenCache: () => void;
