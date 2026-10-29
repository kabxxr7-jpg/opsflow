export { cn } from "cn";
import type { JobStatus } from "@prisma/client";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// `toLocaleDateString()`/`toLocaleString()` with no explicit locale or time zone use the
// runtime's, which differ between the Node server (initial render), the browser (hydration), and
// a visitor's own machine — producing hydration mismatches and, worse, the same timestamp
// showing as two different times on two screens. Pin both: a fixed locale, and UTC (labelled, so
// nobody has to guess), so every surface renders identical text regardless of who's looking or
// where the server runs. "Oct 29, 2026" rather than "10/29/2026" so it's unambiguous outside the US.
const FIXED_LOCALE = "en-US";

const DATE_FORMAT = new Intl.DateTimeFormat(FIXED_LOCALE, { dateStyle: "medium", timeZone: "UTC" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat(FIXED_LOCALE, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatDate(date: Date | string): string {
  return DATE_FORMAT.format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return `${DATE_TIME_FORMAT.format(new Date(date))} UTC`;
}

const USD = new Intl.NumberFormat(FIXED_LOCALE, { style: "currency", currency: "USD" });

/** Always two decimals and thousands separators: "$568.50", "$6,581.55". Accepts Prisma Decimals. */
export function formatCurrency(value: number | string | { toString(): string }): string {
  return USD.format(Number(value.toString()));
}

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat(FIXED_LOCALE, { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 29" — for axis labels. */
export function formatShortDate(date: Date | string): string {
  return SHORT_DATE_FORMAT.format(new Date(date));
}

/** plural(1, "job") -> "1 job"; plural(2, "job") -> "2 jobs". */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
