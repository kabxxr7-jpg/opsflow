import { cn } from "@/lib/utils";

/** The one inline error treatment for forms and dialogs. `role="alert"` makes screen readers announce it when it appears. */
export function FormError({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-text",
        className
      )}
    >
      {children}
    </p>
  );
}
