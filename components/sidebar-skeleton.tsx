import { Workflow } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for <Sidebar> while the session is read. It's part of the static shell, so it paints
 * the instant a navigation starts — same width as the real sidebar, so nothing shifts when the
 * real links arrive.
 */
export function SidebarSkeleton() {
  return (
    <>
      <aside
        aria-hidden
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex"
      >
        <div className="px-2 pb-6">
          <span className="flex items-center gap-2 font-display text-lg font-medium tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Workflow className="size-4" />
            </span>
            Opsflow
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1.5 px-1">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </aside>
      <header aria-hidden className="sticky top-0 z-10 border-b bg-background px-4 py-3 md:hidden">
        <span className="flex items-center gap-2 font-display text-lg font-medium tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Workflow className="size-4" />
          </span>
          Opsflow
        </span>
      </header>
    </>
  );
}
