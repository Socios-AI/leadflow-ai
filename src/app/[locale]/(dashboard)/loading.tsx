// src/app/[locale]/(dashboard)/loading.tsx
//
// Shown automatically by Next.js while the server component for the
// route is being rendered. Eliminates the "click and nothing happens"
// feeling — user sees the skeleton instantly.

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl border border-border bg-card px-6 py-7 space-y-3">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-3 w-72" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-card p-4 space-y-3"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="skeleton h-7 w-16" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-[160px] w-full" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-9 w-24" />
          <div className="space-y-2">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
