"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CYCLE = ["light", "dark", "system"] as const;
const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // Avoids a hydration mismatch: the server has no way to know the client's stored
  // preference, so the icon only reflects the real theme once mounted client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = (mounted ? theme : "system") as (typeof CYCLE)[number];
  const Icon = ICONS[current] ?? Monitor;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("w-full justify-start gap-2.5 px-2.5 text-sidebar-foreground/70", className)}
      onClick={() => {
        const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
        setTheme(next);
      }}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {current === "system" ? "System theme" : current === "dark" ? "Dark theme" : "Light theme"}
    </Button>
  );
}
