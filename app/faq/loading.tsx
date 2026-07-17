import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function FaqLoading() {
  return (
    <AppPageShell>
      <div className="w-full space-y-4 p-4" aria-label="Loading public FAQ" aria-busy="true">
        <div className="flex flex-wrap justify-between gap-3"><div className="space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-96 max-w-full" /></div><div className="flex gap-2"><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-6 w-16 rounded-full" /></div></div>
        <Card><CardHeader className="space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-44" /></CardHeader><CardContent><div className="overflow-hidden rounded-lg border">{Array.from({ length: 8 }).map((_, index) => <div key={`faq-row-${index}`} className="grid grid-cols-[1.5fr_.5fr_.5fr] gap-4 border-b p-3 last:border-b-0 sm:grid-cols-[1.5fr_.5fr_.5fr_1fr_1fr_.4fr]"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="hidden h-4 w-full sm:block" /><Skeleton className="hidden h-4 w-full sm:block" /><Skeleton className="hidden h-8 w-full sm:block" /></div>)}</div></CardContent></Card>
      </div>
    </AppPageShell>
  );
}
