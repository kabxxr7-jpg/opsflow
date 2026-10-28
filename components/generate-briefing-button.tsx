"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { createDailyBriefing } from "@/app/(app)/briefings/actions";
import { Button } from "@/components/ui/button";

export function GenerateBriefingButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await createDailyBriefing();
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Briefing generated.");
        })
      }
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {isPending ? "Generating..." : "Generate briefing"}
    </Button>
  );
}
