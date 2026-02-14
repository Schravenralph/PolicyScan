/**
 * Step3 Info Dialogs Component
 *
 * Dialogs providing help and information about document review
 * and workflow import functionality.
 */
interface Step3InfoDialogsProps {
    showStep3Info: boolean;
    setShowStep3Info: (show: boolean) => void;
    showWorkflowInfo: boolean;
    setShowWorkflowInfo: (show: boolean) => void;
    onOpenWorkflowImport: () => void;
}
declare function Step3InfoDialogsComponent({ showStep3Info, setShowStep3Info, showWorkflowInfo, setShowWorkflowInfo, onOpenWorkflowImport, }: Step3InfoDialogsProps): import("react/jsx-runtime").JSX.Element;
export declare const Step3InfoDialogs: import("react").MemoExoticComponent<typeof Step3InfoDialogsComponent>;
export {};
