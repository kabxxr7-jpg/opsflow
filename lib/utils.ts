export { cn } from "cn";

// `toLocaleDateString()`/`toLocaleString()` with no explicit locale use the runtime's locale,
// which differs between the Node server (initial render) and the browser (hydration) whenever
// they don't agree, producing a hydration mismatch. Pin a fixed locale so server and client
// always render identical text regardless of either environment's locale setting.
const FIXED_LOCALE = "en-US";

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(FIXED_LOCALE);
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString(FIXED_LOCALE);
}
