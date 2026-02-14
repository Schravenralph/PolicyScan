/**
 * Parameter Input Renderer Component
 *
 * Renders parameter inputs based on parameter schema type.
 */
interface ParameterSchema {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    label: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    options?: Array<{
        value: string | number;
        label: string;
    }>;
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;
    };
}
interface ParameterInputRendererProps {
    stepIndex: number;
    paramKey: string;
    paramDef: ParameterSchema;
    value: unknown;
    onValueChange: (stepIndex: number, paramKey: string, value: unknown) => void;
}
export declare function ParameterInputRenderer({ stepIndex, paramKey, paramDef, value, onValueChange, }: ParameterInputRendererProps): import("react/jsx-runtime").JSX.Element;
export {};
