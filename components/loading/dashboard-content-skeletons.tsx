import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkspacePanelSkeleton() {
  return (
    <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Loading conversation workspace" aria-busy="true">
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
        </div>
        <div className="space-y-3 py-4">
          <Skeleton className="h-16 w-3/4 rounded-xl" />
          <Skeleton className="ml-auto h-20 w-4/5 rounded-xl" />
          <Skeleton className="h-14 w-2/3 rounded-xl" />
        </div>
        <div className="mt-auto flex gap-2 border-t pt-3">
          <Skeleton className="h-11 flex-1 rounded-md" />
          <Skeleton className="h-11 w-11 rounded-md" />
        </div>
      </div>
      <div className="hidden space-y-4 rounded-xl border p-4 lg:block">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}

export function ActivityChartSkeleton() {
  return (
    <Card aria-label="Loading activity chart" aria-busy="true">
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-72 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

export function OperationalTableSkeleton() {
  return (
    <Card aria-label="Loading operational overview" aria-busy="true">
      <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2"><Skeleton className="h-9 w-28" /><Skeleton className="h-9 w-32" /></div>
        <div className="overflow-hidden rounded-lg border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`dashboard-table-row-${index}`} className="grid grid-cols-[1.2fr_.7fr_1fr] gap-4 border-b p-3 last:border-b-0 sm:grid-cols-5">
              <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" />
              <Skeleton className="hidden h-4 w-full sm:block" /><Skeleton className="hidden h-4 w-full sm:block" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
