"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Ticket,
  Upload,
  Zap,
  Sparkles,
  Settings,
  Workflow,
  LogOut,
} from "lucide-react";
import { logout } from "@/app/logout/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/intake", label: "Intake", icon: Upload },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/briefings", label: "Briefings", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname?.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-medium tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Workflow className="size-4" aria-hidden />
      </span>
      Opsflow
    </span>
  );
}

export function Sidebar() {
  const isActive = useIsActive();

  return (
    <>
      {/* Desktop: fixed left sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex">
        <div className="px-2 pb-6">
          <Wordmark />
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active && "bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary"
                )}
              >
                <link.icon className="size-4 shrink-0" aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2.5 px-2.5 text-sidebar-foreground/70">
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </form>
      </aside>

      {/* Mobile: top bar */}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:hidden">
        <div className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-3">
          <Wordmark />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-sm text-muted-foreground">
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn("transition-colors hover:text-foreground", active && "font-medium text-primary")}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
