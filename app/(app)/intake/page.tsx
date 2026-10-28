import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageIntakeForm } from "@/components/image-intake-form";
import { formatDateTime } from "@/lib/utils";

const LOW_CONFIDENCE_THRESHOLD = 0.6;

export default async function IntakePage() {
  const ocrTickets = await db.ticket.findMany({
    where: { source: "ocr_upload" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Document intake</h1>
        <p className="text-sm text-muted-foreground">
          OCR (Tesseract.js, no cloud account) feeds extracted text into the same classification
          pipeline as a typed ticket. Proves the pipeline shape, not production-grade handwriting
          accuracy, a stronger OCR engine is a drop-in swap at this exact seam.
        </p>
      </div>

      <ImageIntakeForm />

      {ocrTickets.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Recent OCR intakes</h2>
          {ocrTickets.map((ticket) => {
            const ocrLow = ticket.ocrConfidence !== null && ticket.ocrConfidence < LOW_CONFIDENCE_THRESHOLD;
            const aiLow = ticket.confidence !== null && ticket.confidence < LOW_CONFIDENCE_THRESHOLD;
            return (
              <Card key={ticket.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {formatDateTime(ticket.createdAt)}
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      {ticket.classification ? <Badge>{ticket.classification.replace(/_/g, " ")}</Badge> : null}
                      {ticket.priority ? <Badge variant="secondary">{ticket.priority}</Badge> : null}
                      {ocrLow ? <Badge variant="destructive">low OCR confidence</Badge> : null}
                      {aiLow ? <Badge variant="destructive">low AI confidence</Badge> : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Extracted text: </span>
                    {ticket.rawText}
                  </p>
                  {ticket.ocrConfidence !== null ? (
                    <p className="text-xs text-muted-foreground">
                      OCR confidence: {Math.round(ticket.ocrConfidence * 100)}%
                      {ticket.confidence !== null ? ` · AI confidence: ${Math.round(ticket.confidence * 100)}%` : ""}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
