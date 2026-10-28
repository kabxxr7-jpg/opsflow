"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/logout/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/tickets", label: "Tickets" },
  { href: "/intake", label: "Intake" },
  { href: "/automations", label: "Automations" },
  { href: "/briefings", label: "Briefings" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            Opsflow
          </span>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {LINKS.map((link) => {
              const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "transition-colors hover:text-foreground",
                    isActive && "font-medium text-primary"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
