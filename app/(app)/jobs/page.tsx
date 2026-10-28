import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { JobStatusSelect } from "@/components/job-status-select";
import { formatDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function JobsPage() {
  const jobs = await db.job.findMany({
    include: { customer: true, technician: true },
    orderBy: { scheduledAt: "desc" },
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Simulated field-service jobs, seeded for this demo.
        </p>
      </div>
      <Card>
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
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.customer.name}</TableCell>
                  <TableCell>{job.jobType}</TableCell>
                  <TableCell>{job.technician?.name ?? "Unassigned"}</TableCell>
                  <TableCell>
                    <JobStatusSelect jobId={job.id} status={job.status} />
                  </TableCell>
                  <TableCell>
                    {job.scheduledAt ? formatDate(job.scheduledAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
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
