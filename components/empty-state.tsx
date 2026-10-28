import { cn } from "@/lib/utils";

// A small branded illustration, used wherever a list is genuinely empty, instead of a bare line
// of muted text. Deliberately simple (a clipboard with a checkmark) — costs almost nothing and
// removes the "did this break" feeling a blank Card gives on first glance.
export function EmptyState({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
        <rect x="12" y="8" width="32" height="42" rx="4" className="fill-muted stroke-border" strokeWidth="1.5" />
        <rect x="20" y="4" width="16" height="8" rx="2" className="fill-card stroke-border" strokeWidth="1.5" />
        <circle cx="28" cy="30" r="12" className="fill-primary/10" />
        <path
          d="M22 30l4 4 8-8"
          className="stroke-primary"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
