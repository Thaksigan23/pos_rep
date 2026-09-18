import { Skeleton } from "@/components/ui/skeleton"

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  )
}

export function AppShellSkeleton() {
  return (
    <div className="flex min-h-svh bg-muted/40">
      <div className="hidden w-72 border-r bg-foreground md:block" />
      <div className="flex flex-1 flex-col">
        <div className="h-16 border-b bg-background" />
        <div className="p-6">
          <PageSkeleton />
        </div>
      </div>
    </div>
  )
}
