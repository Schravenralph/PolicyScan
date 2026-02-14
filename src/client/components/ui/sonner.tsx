import { Toaster as Sonner } from "sonner";

const Toaster = () => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      style={
        {
          "--normal-bg": "hsl(var(--background))",
          "--normal-text": "hsl(var(--foreground))",
          "--normal-border": "hsl(var(--border))",
        } as React.CSSProperties
      }
    />
  );
};

export { Toaster };
