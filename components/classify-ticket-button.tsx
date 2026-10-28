"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { classifyTicketById } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";

export function ClassifyTicketButton({ ticketId }: { ticketId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await classifyTicketById(ticketId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Ticket classified.");
        })
      }
    >
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {isPending ? "Classifying..." : "Classify"}
    </Button>
  );
}
