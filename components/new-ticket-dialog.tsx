"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTicket } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { Label } from "@/components/ui/label";
import { LIMITS } from "@/lib/rule-fields";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SOURCE_ITEMS = { phone: "Phone", chat: "Chat", email: "Email" };

export function NewTicketDialog() {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("chat");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setSource("chat");
      setError(null);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm">New ticket</Button>} />
      <DialogContent>
        <form
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await createTicket(formData);
              if (result.error) {
                setError(result.error);
                return;
              }
              toast.success("Ticket created.");
              setOpen(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>
              Simulates a customer inquiry coming in. Runs any active “ticket created” automations, then classifies it with AI.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select items={SOURCE_ITEMS} value={source} onValueChange={(value) => setSource(value ?? "chat")}>
                <SelectTrigger id="source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              {/* This Select is Base UI, not a native form control; mirror the controlled value
                  into a hidden input so the surrounding <form action> still gets it. */}
              <input type="hidden" name="source" value={source} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rawText">Message</Label>
              <Textarea
                id="rawText"
                name="rawText"
                rows={5}
                required
                maxLength={LIMITS.ticketText}
                placeholder="What is the customer saying?"
              />
            </div>
            <FormError>{error}</FormError>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
