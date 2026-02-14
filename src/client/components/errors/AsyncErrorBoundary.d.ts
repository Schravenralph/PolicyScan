/**
 * Async Error Boundary Component
 *
 * Catches async errors in components that regular error boundaries cannot catch.
 * Uses a combination of error boundaries and promise rejection handling.
 */
import { Component, ErrorInfo, ReactNode } from 'react';
interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    showToast?: boolean;
}
interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}
export declare class AsyncErrorBoundary extends Component<Props, State> {
    private unhandledRejectionHandler;
    constructor(props: Props);
    componentDidMount(): void;
    componentWillUnmount(): void;
    static getDerivedStateFromError(error: Error): Partial<State>;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    handleReset: () => void;
    render(): string | number | bigint | boolean | Iterable<ReactNode> | Promise<string | number | bigint | boolean | import("react").ReactPortal | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | import("react/jsx-runtime").JSX.Element | null | undefined;
}
export {};
