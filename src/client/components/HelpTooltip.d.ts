interface HelpTooltipProps {
    content: string;
    title?: string;
    linkTo?: string;
    linkText?: string;
    variant?: 'tooltip' | 'popover';
    className?: string;
}
export declare function HelpTooltip({ content, title, linkTo, linkText, variant, className, }: HelpTooltipProps): import("react/jsx-runtime").JSX.Element;
export {};
