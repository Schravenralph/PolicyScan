import React from 'react';
import { type QueryData } from '../../services/api';
export interface PreviousSetsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectSet: (query: QueryData) => void;
}
/**
 * Dialog component for selecting from previous completed query sets.
 *
 * Allows users to view, search, filter, and load previously completed query sets
 * into the wizard to continue working with them.
 *
 * @example
 * ```tsx
 * <PreviousSetsDialog
 *   isOpen={showPreviousSets}
 *   onClose={() => setShowPreviousSets(false)}
 *   onSelectSet={handleLoadQuerySet}
 * />
 * ```
 */
export declare const PreviousSetsDialog: React.FC<PreviousSetsDialogProps>;
