import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Compass className="size-9 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-medium tracking-tight">Page not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          That address doesn&apos;t lead anywhere. It may have moved, or the link was mistyped.
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "h-9")}>
        Back to the dashboard
      </Link>
    </main>
  );
}
