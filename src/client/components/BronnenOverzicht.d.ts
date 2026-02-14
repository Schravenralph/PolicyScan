/**
 * BronnenOverzicht Component
 *
 * ✅ **MIGRATED** - Now uses canonical document hooks directly.
 *
 * **Migration Status:**
 * - ✅ Uses `useCanonicalDocumentsByQuery` to fetch canonical documents directly
 * - ✅ Uses `useUpdateCanonicalDocumentAcceptance` for status updates
 * - ✅ Transforms canonical documents to Bron format only at BronCard boundary
 * - ✅ All document operations use canonical API hooks
 *
 * **Transformation Strategy:**
 * - Hooks return CanonicalDocument format directly
 * - Component transforms to Bron format only for BronCard display (necessary boundary)
 * - Future: Migrate BronCard to accept CanonicalDocument directly
 *
 * **Migration Reference:**
 * - WI-413: Frontend Hooks & Components Migration
 * - See `docs/70-sprint-backlog/WI-413-frontend-hooks-components-migration.md`
 *
 * @see WI-413: Frontend Hooks & Components Migration
 */
import { type ScanParameters } from '../types/scanParameters';
interface BronnenOverzichtProps {
    onBack: () => void;
    queryId: string;
    scanParameters: ScanParameters;
}
export declare function BronnenOverzicht({ onBack, queryId, scanParameters }: BronnenOverzichtProps): import("react/jsx-runtime").JSX.Element;
export {};
