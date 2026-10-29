import { Briefcase } from "lucide-react";
import { getScopedDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { JobStatusSelect } from "@/components/job-status-select";
import { formatDate, cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { JobStatus } from "@prisma/client";

const STATUS_BORDER: Record<JobStatus, string> = {
  SCHEDULED: "border-l-[var(--chart-1)]",
  IN_PROGRESS: "border-l-[var(--chart-3)]",
  COMPLETED: "border-l-[var(--chart-2)]",
  CANCELLED: "border-l-[var(--chart-5)]",
};

const AVATAR_COLORS = [
  "bg-[var(--chart-1)]",
  "bg-[var(--chart-2)]",
  "bg-[var(--chart-3)]",
  "bg-[var(--chart-4)]",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarColor(name: string) {
  const hash = name.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function TechAvatar({ name }: { name: string | null | undefined }) {
  if (!name) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white",
        avatarColor(name)
      )}
    >
      {initials(name)}
    </span>
  );
}

export default async function JobsPage() {
  const session = await getSession();
  if (!session) return null;
  const db = await getScopedDb();

  // Technicians only ever see jobs assigned to them — owners/dispatchers see everything in the
  // org. This filter is in addition to (not instead of) the org scope getScopedDb() already
  // applies; a technician from a different org couldn't reach this far regardless.
  const jobs = await db.job.findMany({
    where: session.role === "TECHNICIAN" ? { assignedToId: session.userId } : undefined,
    include: { customer: true, technician: true },
    orderBy: { scheduledAt: "desc" },
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-medium tracking-tight">
          <Briefcase className="size-7 text-primary" aria-hidden />
          Jobs
        </h1>
        <p className="text-sm text-muted-foreground">
          {session.role === "TECHNICIAN"
            ? "Jobs assigned to you."
            : "Simulated field-service jobs, seeded for this demo."}
        </p>
      </div>

      {/* Mobile: a card per job, nothing requires horizontal scrolling to find */}
      <div className="space-y-3 md:hidden">
        {jobs.map((job) => (
          <Card key={job.id} className={cn("border-l-4", STATUS_BORDER[job.status])}>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TechAvatar name={job.technician?.name} />
                  <div>
                    <p className="font-medium">{job.customer.name}</p>
                    <p className="text-sm text-muted-foreground">{job.jobType}</p>
                  </div>
                </div>
                <JobStatusSelect jobId={job.id} status={job.status} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{job.technician?.name ?? "Unassigned"}</span>
                <span>{job.scheduledAt ? formatDate(job.scheduledAt) : "—"}</span>
                <span className="text-sm font-semibold text-foreground">
                  {job.revenue ? `$${job.revenue.toString()}` : "—"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: a dense table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Job type</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id} className={cn("border-l-4", STATUS_BORDER[job.status])}>
                  <TableCell className="font-medium">{job.customer.name}</TableCell>
                  <TableCell>{job.jobType}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TechAvatar name={job.technician?.name} />
                      {job.technician?.name ?? "Unassigned"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <JobStatusSelect jobId={job.id} status={job.status} />
                  </TableCell>
                  <TableCell>
                    {job.scheduledAt ? formatDate(job.scheduledAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {job.revenue ? `$${job.revenue.toString()}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
