import { Skeleton } from "@/components/ui/skeleton";

export function AuthShellSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="min-h-screen bg-slate-100 px-3 py-3 sm:px-6 sm:py-6 lg:px-8" aria-label="Loading secure access" aria-busy="true">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-6xl overflow-hidden rounded-2xl border bg-white shadow-xl sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="bg-[#0b2f6b] px-6 py-7 sm:px-10 sm:py-10 lg:px-12 lg:py-12">
          <Skeleton className="h-24 w-44 bg-white/90 sm:w-52" />
          <div className="mt-12 space-y-4 lg:mt-28">
            <Skeleton className="h-3 w-36 bg-blue-300/30" />
            <Skeleton className="h-10 w-4/5 bg-white/20" />
            <Skeleton className="h-4 w-full bg-white/15" />
            <Skeleton className="h-4 w-3/4 bg-white/15" />
          </div>
        </div>
        <div className="flex items-center px-5 py-8 sm:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-md space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="space-y-5">
              {Array.from({ length: fields }).map((_, index) => (
                <div key={`auth-field-${index}`} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-11 w-full rounded-md" />
                </div>
              ))}
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
