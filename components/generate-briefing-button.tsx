"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
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
      <Sparkles className="size-3.5" />
      {isPending ? "Generating..." : "Generate briefing"}
    </Button>
  );
}
