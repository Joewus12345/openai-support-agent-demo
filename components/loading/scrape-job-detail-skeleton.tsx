import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ScrapeJobDetailSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading scrape job details" aria-busy="true">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2"><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-4 w-96 max-w-full" /><div className="flex gap-2"><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-6 w-28 rounded-full" /></div></div>
        <div className="flex gap-2"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-20" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Card key={`job-metric-${index}`}><CardContent className="space-y-3 p-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-32" /><Skeleton className="h-3 w-20" /></CardContent></Card>)}</div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent className="space-y-4">{Array.from({ length: 5 }).map((_, index) => <div key={`job-stage-${index}`} className="flex gap-3"><Skeleton className="h-8 w-8 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-full" /></div></div>)}</CardContent></Card>
        <Card><CardHeader><Skeleton className="h-5 w-44" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-16 w-full" /></CardContent></Card>
      </div>
      <Card><CardHeader className="space-y-3"><Skeleton className="h-5 w-28" /><div className="flex flex-wrap gap-2"><Skeleton className="h-9 w-44" /><Skeleton className="h-9 w-44" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-24" /></div></CardHeader><CardContent><Skeleton className="h-72 w-full rounded-lg" /></CardContent></Card>
    </div>
  );
}
