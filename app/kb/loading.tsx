import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function KnowledgeBaseLoading() {
  return (
    <AppPageShell>
      <div className="py-4 md:py-6" aria-label="Loading knowledge base" aria-busy="true">
        <Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><Skeleton className="h-5 w-48" /><Skeleton className="h-10 w-full sm:w-64" /></CardHeader><CardContent className="space-y-3"><div className="overflow-hidden rounded-lg border">{Array.from({ length: 8 }).map((_, index) => <div key={`kb-row-${index}`} className="grid grid-cols-[1.4fr_.5fr_.5fr] gap-4 border-b p-3 last:border-b-0 sm:grid-cols-5"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="hidden h-4 w-full sm:block" /><Skeleton className="hidden h-4 w-full sm:block" /></div>)}</div><div className="flex justify-between"><Skeleton className="h-4 w-28" /><div className="flex gap-2"><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-20" /></div></div></CardContent></Card>
      </div>
    </AppPageShell>
  );
}
