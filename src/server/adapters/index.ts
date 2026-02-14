/**
 * Plan Suite v2 - Adapters Module
 * 
 * This module contains adapters for ingesting documents from various sources:
 * - DSO STOP/TPOD adapter (EP-09)
 * - Rechtspraak adapter (EP-10)
 * - Wetgeving adapter (EP-11)
 * - Gemeente/Beleid adapter (EP-12)
 * 
 * All adapters implement the IAdapter contract defined in contracts.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/00-interfaces-contracts.md
 */

export { DsoAdapter } from './dso/DsoAdapter.js';
export { RechtspraakAdapter } from './rechtspraak/RechtspraakAdapter.js';
export { WetgevingAdapter } from './wetgeving/WetgevingAdapter.js';
export { GemeenteBeleidAdapter } from './gemeente/GemeenteBeleidAdapter.js';
export { AdapterOrchestrator } from './AdapterOrchestrator.js';

export type { IAdapter } from '../contracts/types.js';

