/**
 * Error Boundary Component
 * Catches React component errors and displays user-friendly error messages
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}
interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    healthCheck: {
        checked: boolean;
        healthy?: boolean;
        diagnostic?: string;
        apiUrl?: string;
    } | null;
}
export declare class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props);
    static getDerivedStateFromError(error: Error): Partial<State>;
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void;
    /**
     * Check backend health asynchronously for debugging context
     * This is non-blocking - error is shown immediately, health check adds context when available
     */
    private checkBackendHealthAsync;
    handleReset: () => void;
    handleGoHome: () => void;
    render(): string | number | bigint | boolean | Iterable<React.ReactNode> | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | import("react/jsx-runtime").JSX.Element | null | undefined;
}
/**
 * Higher-order component to wrap components with ErrorBoundary
 */
export declare function withErrorBoundary<P extends object>(Component: React.ComponentType<P>, fallback?: ReactNode, onError?: (error: Error, errorInfo: React.ErrorInfo) => void): (props: P) => import("react/jsx-runtime").JSX.Element;
export {};
