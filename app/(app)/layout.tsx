import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import { getSession } from "@/lib/auth";

// Reading the session cookie is per-request work, so it lives *inside* a Suspense boundary
// rather than at the top of the layout. That keeps everything outside it — the page frame, the
// sidebar skeleton, and each route's loading.tsx fallback — part of the static shell, which is
// what lets navigation paint immediately and lets prefetching stay cheap (it fetches the shell,
// not a full authenticated render of every page a link points at).
async function SessionSidebar() {
  const session = await getSession();
  return <Sidebar role={session?.role ?? null} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20 md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Suspense fallback={<SidebarSkeleton />}>
        <SessionSidebar />
      </Suspense>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-24 md:px-8 md:pb-8">
        {children}
      </main>
    </div>
  );
}
