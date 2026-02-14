import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-2 border-primary hover:bg-primary/90 hover:border-primary/90",
        destructive:
          "bg-destructive text-white border-2 border-destructive hover:bg-destructive/90 hover:border-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 dark:border-destructive/60",
        outline:
          "border-2 border-primary bg-background text-foreground hover:bg-accent hover:text-accent-foreground hover:border-accent dark:bg-input/30 dark:border-primary dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground border-2 border-secondary hover:bg-secondary/80 hover:border-secondary/80",
        ghost:
          "border-2 border-border hover:bg-accent hover:text-accent-foreground hover:border-accent dark:hover:bg-accent/50",
        link: "border-2 border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
      isLoading?: boolean;
      loadingText?: string;
    }
>(({ className, variant, size, asChild = false, isLoading = false, loadingText, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  if (asChild) {
    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {(isLoading && loadingText) ? loadingText : children}
    </Comp>
  );
});

Button.displayName = "Button";

export { Button, buttonVariants };
