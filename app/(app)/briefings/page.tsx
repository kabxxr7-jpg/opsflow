import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateBriefingButton } from "@/components/generate-briefing-button";
import { formatDateTime } from "@/lib/utils";

type Highlight = {
  type: "opportunity" | "risk" | "follow_up" | "praise";
  description: string;
  sourceTicketId: string | null;
  confidence: number;
};

const HIGHLIGHT_VARIANT: Record<Highlight["type"], "default" | "secondary" | "destructive" | "outline"> = {
  opportunity: "default",
  risk: "destructive",
  follow_up: "secondary",
  praise: "outline",
};

export default async function BriefingsPage() {
  const briefings = await db.dailyBriefing.findMany({ orderBy: { date: "desc" } });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Daily briefings</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated summaries of ticket activity, with source citations and confidence scores.
          </p>
        </div>
        <GenerateBriefingButton />
      </div>
      {briefings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No briefings generated yet. Click &ldquo;Generate briefing&rdquo; to summarize today&apos;s tickets.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {briefings.map((briefing) => {
            const highlights = (briefing.highlights as unknown as Highlight[]) ?? [];
            return (
              <Card key={briefing.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {formatDateTime(briefing.date)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{briefing.summary}</p>
                  {highlights.length > 0 ? (
                    <div className="space-y-2 border-t pt-3">
                      {highlights.map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Badge variant={HIGHLIGHT_VARIANT[h.type]} className="shrink-0">
                            {h.type.replace(/_/g, " ")}
                          </Badge>
                          <div className="space-y-0.5">
                            <p className="text-foreground">{h.description}</p>
                            <p className="text-muted-foreground">
                              {Math.round(h.confidence * 100)}% confidence
                              {h.sourceTicketId ? ` · ticket ${h.sourceTicketId.slice(0, 8)}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
