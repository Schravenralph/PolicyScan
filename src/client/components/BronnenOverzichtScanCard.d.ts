/**
 * BronnenOverzicht Scan Card Component
 *
 * Card for starting automatic scan with progress indicator.
 */
interface ScanProgress {
    status: string;
    currentStep: string;
    documentsFound: number;
    sourcesFound: number;
}
interface BronnenOverzichtScanCardProps {
    isScanning: boolean;
    scanProgress: ScanProgress | null;
    onStartScan: () => void;
}
export declare function BronnenOverzichtScanCard({ isScanning, scanProgress, onStartScan, }: BronnenOverzichtScanCardProps): import("react/jsx-runtime").JSX.Element;
export {};
