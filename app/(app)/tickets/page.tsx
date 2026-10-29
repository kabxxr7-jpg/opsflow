import type { Metadata } from "next";
import { Ticket as TicketIcon, Eye } from "lucide-react";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/authz";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import { ClassifyTicketButton } from "@/components/classify-ticket-button";
import { TicketDetailSheet } from "@/components/ticket-detail-sheet";
import { formatDate } from "@/lib/utils";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "default",
  URGENT: "destructive",
};

const LOW_CONFIDENCE_THRESHOLD = 0.5;

// Server Actions used on this page (OCR, AI calls) inherit this ceiling instead of the platform default.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage() {
  const session = await getSession();
  const db = await getScopedDb();
  const showAutomationsLink = session ? can(session.role, "view:automations") : false;
  const tickets = await db.ticket.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-medium tracking-tight">
            <TicketIcon className="size-7 text-primary" aria-hidden />
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            Simulated customer inquiries (phone, chat, email), classified by Gemini with
            schema-validated, source-grounded output.
          </p>
        </div>
        <NewTicketDialog />
      </div>
      {tickets.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message="No tickets yet. Create one, or upload a photo on the Intake page." />
          </CardContent>
        </Card>
      ) : null}
      <div className="space-y-3">
        {tickets.map((ticket) => {
          const needsReview =
            ticket.classification !== null &&
            ticket.confidence !== null &&
            ticket.confidence < LOW_CONFIDENCE_THRESHOLD;
          const groundingMismatch =
            needsReview && ticket.sourceSnippet !== null && !ticket.rawText.includes(ticket.sourceSnippet);
          const isUrgent = ticket.priority === "URGENT";

          return (
            <Card
              key={ticket.id}
              className={isUrgent ? "border-l-4 border-l-destructive" : undefined}
            >
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    via {ticket.source} · {formatDate(ticket.createdAt)}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {ticket.classification ? (
                      <>
                        <Badge>{ticket.classification.replace(/_/g, " ")}</Badge>
                        {ticket.priority ? (
                          <Badge variant={PRIORITY_VARIANT[ticket.priority]} className="text-[11px]">
                            {ticket.priority}
                          </Badge>
                        ) : null}
                        {needsReview ? <Badge variant="destructive">needs review</Badge> : null}
                        <TicketDetailSheet
                          ticket={ticket}
                          showAutomationsLink={showAutomationsLink}
                          trigger={
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`View details for ticket from ${ticket.source}, ${formatDate(ticket.createdAt)}`}>
                              <Eye className="size-3.5" aria-hidden />
                            </Button>
                          }
                        />
                      </>
                    ) : (
                      <>
                        <Badge variant="outline">unclassified</Badge>
                        <ClassifyTicketButton ticketId={ticket.id} />
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{ticket.rawText}</p>
                {ticket.summary ? (
                  <div className="space-y-1 rounded-md border-l-2 border-primary/30 bg-muted/30 py-2 pr-2 pl-3 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">AI summary: </span>
                      {ticket.summary}
                    </p>
                    {ticket.sourceSnippet ? (
                      <p>
                        <span className="font-medium text-foreground">Grounded on: </span>
                        &ldquo;{ticket.sourceSnippet}&rdquo;
                      </p>
                    ) : null}
                    {ticket.confidence !== null ? (
                      <p>
                        <span className="font-medium text-foreground">Confidence: </span>
                        {Math.round(ticket.confidence * 100)}%
                      </p>
                    ) : null}
                    {groundingMismatch ? (
                      <p className="rounded-md bg-accent px-2 py-1.5 text-accent-foreground">
                        This is the grounding safeguard working, not a bug: the model&apos;s claimed
                        quote didn&apos;t match the source text exactly, so confidence was
                        automatically capped and the ticket flagged for a human to check. See{" "}
                        <code className="font-mono">lib/ai.ts</code>.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
