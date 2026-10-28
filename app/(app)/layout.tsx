import { Nav } from "@/components/nav";

// All routes under this layout read the session cookie (via proxy.ts) and hit the DB directly.
// Cache Components' instant-navigation validation flags that as un-prerenderable, correctly, since
// this is authenticated, per-request data. Opting out here per Next's own guidance rather than
// restructuring every page behind Suspense boundaries for a demo app that doesn't need that.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
