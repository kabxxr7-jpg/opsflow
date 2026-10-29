import { Briefcase, DollarSign, Sparkles, TrendingUp, AlertTriangle, Clock, ThumbsUp } from "lucide-react";
import { getScopedDb } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateBriefingButton } from "@/components/generate-briefing-button";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatDateTime } from "@/lib/utils";

type Highlight = {
  type: "opportunity" | "risk" | "follow_up" | "praise";
  description: string;
  sourceTicketId: string | null;
  confidence: number;
};

const HIGHLIGHT_STYLE: Record<Highlight["type"], { icon: typeof TrendingUp; border: string; label: string }> = {
  opportunity: { icon: TrendingUp, border: "border-l-[var(--chart-2)]", label: "opportunity" },
  risk: { icon: AlertTriangle, border: "border-l-destructive", label: "risk" },
  follow_up: { icon: Clock, border: "border-l-[var(--chart-3)]", label: "follow up" },
  praise: { icon: ThumbsUp, border: "border-l-[var(--chart-1)]", label: "praise" },
};

export default async function BriefingsPage() {
  const db = await getScopedDb();
  const briefings = await db.dailyBriefing.findMany({ orderBy: { date: "desc" } });

  const dayStats = await Promise.all(
    briefings.map(async (b) => {
      const start = new Date(b.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const agg = await db.job.aggregate({
        where: { completedAt: { gte: start, lt: end } },
        _sum: { revenue: true },
        _count: true,
      });
      return { id: b.id, jobsCompleted: agg._count, revenue: Number(agg._sum.revenue ?? 0) };
    })
  );
  const statsById = new Map(dayStats.map((s) => [s.id, s]));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-medium tracking-tight">
            <Sparkles className="size-7 text-primary" aria-hidden />
            Daily briefings
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-generated summaries of ticket activity, with source citations and confidence scores.
          </p>
        </div>
        <GenerateBriefingButton />
      </div>
      {briefings.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState message='No briefings generated yet. Click "Generate briefing" to summarize today&apos;s tickets.' />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {briefings.map((briefing) => {
            const highlights = (briefing.highlights as unknown as Highlight[]) ?? [];
            const stats = statsById.get(briefing.id);
            return (
              <Card key={briefing.id} className="overflow-hidden">
                <CardHeader className="border-b bg-muted/30 pb-3">
                  <CardTitle className="text-base">{formatDate(briefing.date)}</CardTitle>
                  <p className="text-xs text-muted-foreground">{formatDateTime(briefing.date)}</p>
                  {stats ? (
                    <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-foreground">
                      <span className="flex items-center gap-1.5">
                        <Briefcase className="size-3.5 text-primary" aria-hidden />
                        {stats.jobsCompleted} job{stats.jobsCompleted === 1 ? "" : "s"} completed
                      </span>
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="size-3.5 text-primary" aria-hidden />
                        ${stats.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} revenue
                      </span>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <p className="text-sm">{briefing.summary}</p>
                  {highlights.length > 0 ? (
                    <div className="space-y-2">
                      {highlights.map((h, i) => {
                        const style = HIGHLIGHT_STYLE[h.type] ?? HIGHLIGHT_STYLE.follow_up;
                        const HighlightIcon = style.icon;
                        return (
                          <div
                            key={i}
                            className={`flex items-start gap-2.5 rounded-md border-l-4 bg-muted/30 p-2.5 text-xs ${style.border}`}
                          >
                            <HighlightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-foreground">{h.description}</p>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-background px-2 py-0.5 font-medium text-foreground ring-1 ring-border">
                                  {Math.round(h.confidence * 100)}% confidence
                                </span>
                                <span className="capitalize text-muted-foreground">{style.label}</span>
                                {h.sourceTicketId ? (
                                  <span className="text-muted-foreground">· ticket {h.sourceTicketId.slice(0, 8)}</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
