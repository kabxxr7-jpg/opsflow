import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading states for each route. Each route has its own loading.tsx (rather than one shared
// boundary above them all) on purpose: a navigation between sibling routes keeps shared
// boundaries mounted, so React holds the old page on screen instead of showing their fallback.
// A boundary that belongs to the *destination* route is new on every navigation into it, which is
// what makes the skeleton appear the instant a link is clicked.

function Heading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      {children}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function GenericPageSkeleton() {
  return (
    <Frame>
      <Heading />
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    </Frame>
  );
}

export function DashboardSkeleton() {
  return (
    <Frame>
      <Heading />
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <Card key={i}>
            <CardContent className="py-6">
              <Skeleton className="h-[140px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </Frame>
  );
}

export function TableSkeleton() {
  return (
    <Frame>
      <Heading />
      <Card>
        <CardContent className="space-y-3 py-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    </Frame>
  );
}

export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Frame>
      <Heading />
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 py-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </Frame>
  );
}
