import { Sidebar } from "@/components/sidebar";

// All routes under this layout read the session cookie (via proxy.ts) and hit the DB directly.
// Cache Components' instant-navigation validation flags that as un-prerenderable, correctly, since
// this is authenticated, per-request data. Opting out here per Next's own guidance rather than
// restructuring every page behind Suspense boundaries for a demo app that doesn't need that.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-muted/20 md:flex-row flex-col">
      <Sidebar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-24 md:px-8 md:pb-8">{children}</main>
    </div>
  );
}
