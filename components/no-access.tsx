import { ShieldAlert } from "lucide-react";

/** What a signed-in person sees on a page their role isn't granted (lib/authz.ts). */
export function NoAccess({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
