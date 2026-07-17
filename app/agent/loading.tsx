import { AppPageShell } from "@/components/app-page-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentLoading() {
  return (
    <AppPageShell>
      <div className="mx-auto w-full max-w-6xl space-y-6" aria-label="Loading agent workspace" aria-busy="true">
        <div className="space-y-3 border-b pb-5"><div className="flex gap-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-6 w-24 rounded-full" /></div><Skeleton className="h-9 w-72 max-w-full" /><Skeleton className="h-4 w-[36rem] max-w-full" /></div>
        <div className="space-y-3"><Skeleton className="h-5 w-24" /><div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <Card key={`agent-tool-${index}`}><CardHeader className="space-y-3"><Skeleton className="h-10 w-10 rounded-lg" /><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></CardHeader></Card>)}</div></div>
        <Card className="border-dashed"><CardContent className="flex items-center justify-between gap-4 p-5"><div className="space-y-2"><Skeleton className="h-4 w-64 max-w-full" /><Skeleton className="h-4 w-80 max-w-full" /></div><Skeleton className="h-6 w-20 rounded-full" /></CardContent></Card>
      </div>
    </AppPageShell>
  );
}
