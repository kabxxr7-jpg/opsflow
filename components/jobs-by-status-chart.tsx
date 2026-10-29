"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "var(--chart-1)",
  IN_PROGRESS: "var(--chart-3)",
  COMPLETED: "var(--chart-2)",
  CANCELLED: "var(--chart-5)",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

type Props = {
  data: { status: string; count: number }[];
};

export function JobsByStatusChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex items-center gap-6">
      <div
        className="relative h-[140px] w-[140px] shrink-0"
        role="img"
        aria-label={`Donut chart of ${total} jobs by status: ${data.map((d) => `${STATUS_LABEL[d.status] ?? d.status} ${d.count}`).join(", ")}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={44}
              outerRadius={66}
              strokeWidth={2}
              stroke="var(--card)"
            >
              {data.map((entry) => (
                <Cell key={entry.status} fill={STATUS_COLOR[entry.status] ?? "var(--chart-5)"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
              }}
              formatter={(value, name) => [value, STATUS_LABEL[String(name)] ?? String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold">{total}</span>
          <span className="text-[10px] text-muted-foreground">jobs</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-xs">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: STATUS_COLOR[d.status] ?? "var(--chart-5)" }}
              aria-hidden
            />
            <span className="text-muted-foreground">{STATUS_LABEL[d.status] ?? d.status}</span>
            <span className="font-medium text-foreground">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
