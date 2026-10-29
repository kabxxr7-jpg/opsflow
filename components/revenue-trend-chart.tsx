"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

type Props = {
  data: { label: string; revenue: number }[];
};

export function RevenueTrendChart({ data }: Props) {
  return (
    <div
      className="h-[110px] w-full"
      role="img"
      aria-label={`Bar chart of completed-job revenue by day: ${data.map((d) => `${d.label} ${formatCurrency(d.revenue)}`).join(", ")}.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(value) => [formatCurrency(Number(value)), "Revenue"]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          />
          <Bar dataKey="revenue" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
