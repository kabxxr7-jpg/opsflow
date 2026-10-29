"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  onConfirm: () => Promise<ActionResult>;
};

/**
 * Irreversible actions ask first. Lives in a Dialog rather than window.confirm() because the
 * browser's native dialogs are unstyled, blocked in some embedded contexts, and can't show
 * the pending/error state of the action they guard.
 */
export function ConfirmDialog({ trigger, title, description, confirmLabel, successMessage, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (isPending) return; // don't let a half-finished delete be dismissed into ambiguity
    setOpen(next);
    if (next) setError(null);
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FormError>{error}</FormError>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={isPending} />}>Cancel</DialogClose>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
