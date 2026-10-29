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
  Info,
  MoreHorizontal,
  Sun,
  Moon,
  Monitor,
  LogIn,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { UserRole } from "@prisma/client";
import { logout } from "@/app/logout/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { can, type Action } from "@/lib/authz";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon; requires?: Action };

// Which links a role sees comes from the same matrix (lib/authz.ts) the Server Actions and pages
// enforce, so the nav can't offer a destination the server will then refuse.
const APP_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase, requires: "view:jobs" },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/intake", label: "Intake", icon: Upload },
  { href: "/automations", label: "Automations", icon: Zap, requires: "view:automations" },
  { href: "/briefings", label: "Briefings", icon: Sparkles, requires: "view:briefings" },
  { href: "/settings", label: "Settings", icon: Settings, requires: "view:settings" },
  { href: "/about", label: "About", icon: Info },
];

// A signed-out visitor can reach exactly one page in this layout: /about.
const VISITOR_LINKS: NavLink[] = [{ href: "/about", label: "About", icon: Info }];

// The five most-used destinations get a thumb-reachable bottom tab; the rest live in the "More"
// overflow menu in the mobile top bar. Field techs on a phone shouldn't have to pinch-read a
// wrapping row of text links to find the thing they want.
const BOTTOM_TABS = ["/dashboard", "/jobs", "/tickets", "/automations", "/briefings"];

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

const THEME_CYCLE = ["light", "dark", "system"] as const;
const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABELS = { light: "Light theme", dark: "Dark theme", system: "System theme" } as const;

export function Sidebar({ role }: { role: UserRole | null }) {
  const isActive = useIsActive();
  const { theme, setTheme } = useTheme();
  const signedIn = role !== null;
  const visibleLinks = signedIn
    ? APP_LINKS.filter((l) => !l.requires || can(role, l.requires))
    : VISITOR_LINKS;
  const bottomLinks = signedIn ? visibleLinks.filter((l) => BOTTOM_TABS.includes(l.href)) : visibleLinks;
  const overflowLinks = signedIn ? visibleLinks.filter((l) => !BOTTOM_TABS.includes(l.href)) : [];
  const currentTheme = (theme ?? "system") as (typeof THEME_CYCLE)[number];
  const ThemeIcon = THEME_ICONS[currentTheme] ?? Monitor;
  const cycleTheme = () => setTheme(THEME_CYCLE[(THEME_CYCLE.indexOf(currentTheme) + 1) % THEME_CYCLE.length]);

  return (
    <>
      {/* Desktop: fixed left sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex">
        <div className="px-2 pb-6">
          <Wordmark />
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5">
          {visibleLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
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
        <div className="space-y-0.5 border-t pt-2">
          <ThemeToggle />
          {signedIn ? (
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2.5 px-2.5 text-sidebar-foreground/70">
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Button>
            </form>
          ) : (
            <Link
              href="/login"
              className="flex h-7 w-full items-center gap-2.5 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium text-sidebar-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogIn className="size-4" aria-hidden />
              Sign in
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile: slim top bar (brand + overflow) */}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" aria-label="More navigation and account options">
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {overflowLinks.map((link) => (
                <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
                  <link.icon className="size-4" aria-hidden />
                  {link.label}
                </DropdownMenuItem>
              ))}
              {overflowLinks.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem onClick={cycleTheme}>
                <ThemeIcon className="size-4" aria-hidden />
                {THEME_LABELS[currentTheme]}
              </DropdownMenuItem>
              {signedIn ? (
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem render={<Link href="/login" />}>
                  <LogIn className="size-4" aria-hidden />
                  Sign in
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile: fixed bottom tab bar */}
      <nav aria-label="Primary (mobile)" className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
        {bottomLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] text-muted-foreground transition-colors",
                active && "text-primary"
              )}
            >
              <link.icon className="size-5" aria-hidden />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
