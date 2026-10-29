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
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, ownerOnly: false },
  { href: "/jobs", label: "Jobs", icon: Briefcase, ownerOnly: false },
  { href: "/tickets", label: "Tickets", icon: Ticket, ownerOnly: false },
  { href: "/intake", label: "Intake", icon: Upload, ownerOnly: false },
  { href: "/automations", label: "Automations", icon: Zap, ownerOnly: true },
  { href: "/briefings", label: "Briefings", icon: Sparkles, ownerOnly: false },
  { href: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
  { href: "/about", label: "About", icon: Info, ownerOnly: false },
];

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
  const visibleLinks = LINKS.filter((l) => !l.ownerOnly || role === "OWNER");
  const bottomLinks = visibleLinks.filter((l) => BOTTOM_TABS.includes(l.href));
  const overflowLinks = visibleLinks.filter((l) => !BOTTOM_TABS.includes(l.href));
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
        <nav className="flex flex-1 flex-col gap-0.5">
          {visibleLinks.map((link) => {
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
        <div className="space-y-0.5 border-t pt-2">
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start gap-2.5 px-2.5 text-sidebar-foreground/70">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile: slim top bar (brand + overflow) */}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" aria-label="More">
                  <MoreHorizontal className="size-4" />
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={cycleTheme}>
                <ThemeIcon className="size-4" aria-hidden />
                {THEME_LABELS[currentTheme]}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => logout()}>
                <LogOut className="size-4" aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile: fixed bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
        {bottomLinks.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
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
