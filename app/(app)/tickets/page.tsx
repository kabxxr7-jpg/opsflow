import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewTicketDialog } from "@/components/new-ticket-dialog";
import { ClassifyTicketButton } from "@/components/classify-ticket-button";
import { formatDate } from "@/lib/utils";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "default",
  URGENT: "destructive",
};

const LOW_CONFIDENCE_THRESHOLD = 0.5;

export default async function TicketsPage() {
  const tickets = await db.ticket.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Simulated customer inquiries (phone, chat, email), classified by Gemini with
            schema-validated, source-grounded output.
          </p>
        </div>
        <NewTicketDialog />
      </div>
      <div className="space-y-3">
        {tickets.map((ticket) => {
          const needsReview =
            ticket.classification !== null &&
            ticket.confidence !== null &&
            ticket.confidence < LOW_CONFIDENCE_THRESHOLD;

          return (
            <Card key={ticket.id}>
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
                          <Badge variant={PRIORITY_VARIANT[ticket.priority]}>{ticket.priority}</Badge>
                        ) : null}
                        {needsReview ? <Badge variant="destructive">needs review</Badge> : null}
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
                  <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
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
